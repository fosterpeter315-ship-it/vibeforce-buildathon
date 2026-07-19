import { chromium } from "playwright";
import type { CabinClass } from "@points-search/shared";
import { env } from "../env.js";

export interface ParsedFlight {
  milesPrice: number;
  taxesFeesCents: number;
  currency: string;
  stops: number;
  flightNumbers?: string[];
  departAt?: string;
  arriveAt?: string;
  durationMinutes?: number;
  rawPayload?: unknown;
}

export interface DeltaSearchParams {
  origin: string;
  destination: string;
  date: string; // YYYY-MM-DD
  cabin: CabinClass;
  nonstopOnly: boolean;
}

const OFFER_API_URL = "https://offer-api-prd.delta.com/prd/rm-offer-gql";

/**
 * Verified against a real captured session (2026-07-19): this is Delta's
 * flexible-dates calendar query, confirmed to work with NO cookies/auth —
 * it's a public, unauthenticated endpoint. It returns the cheapest
 * miles/cash price per day across a date window, not a specific itinerary.
 *
 * "MAIN" (Main Cabin / economy) is the only confirmed cabin value, taken
 * directly from the capture. The other three are UNVERIFIED GUESSES based
 * on Delta's public cabin naming (Comfort+/Premium Select, Delta One, First)
 * — nothing in the capture confirms these actually filter results by cabin.
 * To verify: repeat the HAR capture with a non-economy cabin explicitly
 * selected on delta.com before searching, and diff the request body against
 * this one.
 */
const CABIN_BRAND_ID: Record<CabinClass, string> = {
  economy: "MAIN", // confirmed
  premium_economy: "PREMIUM_SELECT", // unverified guess
  business: "DELTA_ONE", // unverified guess
  first: "FIRST", // unverified guess
};

const CALENDAR_QUERY = `query ($offerSearchCriteria: OfferSearchCriteriaInput!) {
  gqlSearchOffers(offerSearchCriteria: $offerSearchCriteria) {
    offerResponseId
    gqlOffersSets {
      offers {
        offerId
        additionalOfferProperties {
          offered
          soldOut
          lowestFare
          totalTripStopCnt
          discountAvailable
        }
        offerPricing {
          totalAmt {
            currencyEquivalentPrice {
              currencyAmt
            }
            milesEquivalentPrice {
              mileCnt
            }
          }
        }
      }
      itineraryDepartureDate
    }
    offerDataList {
      pricingOptions {
        pricingOptionDetail {
          currencyCode
        }
      }
    }
  }
}`;

function buildRequestBody(params: DeltaSearchParams) {
  return {
    variables: {
      offerSearchCriteria: {
        productGroups: [{ productCategoryCode: "FLIGHTS" }],
        customers: [{ passengerTypeCode: "ADT", passengerId: "1" }],
        offersCriteria: {
          resultsPageNum: 1,
          pricingCriteria: { priceableIn: ["MILES"] },
          preferences: {
            // Field name confirmed from the capture (value there was false);
            // Delta's actual filtering behavior for true is not yet verified,
            // so parseCalendarResponse() below re-filters defensively too.
            nonStopOnly: params.nonstopOnly,
            refundableOnly: false,
            excludeBrandTypes: [],
          },
          flightRequestCriteria: {
            sortByBrandId: CABIN_BRAND_ID[params.cabin],
            searchOriginDestination: [
              {
                departureLocalTs: `${params.date}T00:00:00`,
                destinations: [{ airportCode: params.destination }],
                origins: [{ airportCode: params.origin }],
                // Matches the exact window from the verified capture. A
                // narrower/zero window was never confirmed against the real
                // API and may behave differently (or return nothing) — we
                // just pick params.date back out of this wider response.
                calenderDateRequest: { daysBeforeCnt: 3, daysAfterCnt: 3 },
              },
            ],
          },
        },
      },
    },
    query: CALENDAR_QUERY,
  };
}

export async function runDeltaSearch(params: DeltaSearchParams): Promise<ParsedFlight[]> {
  const browser = await chromium.launch({
    headless: env.headless,
    executablePath: env.chromiumExecutablePath,
  });
  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      viewport: { width: 1366, height: 900 },
    });
    const page = await context.newPage();

    // Load a real delta.com page first so the POST below runs with the same
    // browser/JS/TLS fingerprint a genuine page load would have, even though
    // the endpoint itself didn't require any session state in the capture.
    await page.goto("https://www.delta.com/", { waitUntil: "domcontentloaded" });

    const body = buildRequestBody(params);
    const payload = await page.evaluate(
      async ({ url, body, airportPair }) => {
        const transactionId = `${crypto.randomUUID()}_${Date.now()}`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            accept: "application/json, text/plain, */*",
            "content-type": "application/json",
            airline: "DL",
            applicationid: "DC",
            channelid: "DCOM",
            transactionid: transactionId,
            "x-app-route": "dates",
            "x-app-type": "dcom-shop",
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          throw new Error(`Delta offer API ${res.status} for ${airportPair}`);
        }
        return res.json();
      },
      { url: OFFER_API_URL, body, airportPair: `${params.origin}-${params.destination}` },
    );

    return parseCalendarResponse(payload, params);
  } finally {
    await browser.close();
  }
}

function parseCalendarResponse(payload: unknown, params: DeltaSearchParams): ParsedFlight[] {
  const label = `${params.origin}->${params.destination} ${params.date} (${params.cabin})`;
  const search = (payload as any)?.data?.gqlSearchOffers;
  const offerSets: any[] = search?.gqlOffersSets ?? [];
  const currency: string =
    search?.offerDataList?.pricingOptions?.[0]?.pricingOptionDetail?.currencyCode ?? "USD";

  const daySet = offerSets.find((set) => set.itineraryDepartureDate === params.date);
  if (!daySet) {
    const available = offerSets.map((s) => s.itineraryDepartureDate);
    console.log(
      `[delta] ${label}: no matching day in response. Dates returned: ${available.join(", ") || "(none — check for GraphQL errors)"}`,
    );
    if ((payload as any)?.errors) {
      console.log(`[delta] ${label}: GraphQL errors:`, JSON.stringify((payload as any).errors));
    }
    return [];
  }

  let priced = (daySet.offers ?? []).filter((offer: any) => offer.offerPricing?.length);
  const totalOffers = (daySet.offers ?? []).length;
  // Defensive re-filter: the request already asked Delta for nonStopOnly,
  // but that server-side behavior is unverified, so don't trust it alone.
  if (params.nonstopOnly) {
    priced = priced.filter(
      (offer: any) => (offer.additionalOfferProperties?.totalTripStopCnt ?? 0) === 0,
    );
  }
  if (priced.length === 0) {
    console.log(
      `[delta] ${label}: day found but 0 usable offers (${totalOffers} total offers, ` +
        `${(daySet.offers ?? []).filter((o: any) => o.offerPricing?.length).length} priced before nonstop filter). ` +
        `If cabin is not economy, this is likely the unverified CABIN_BRAND_ID guess ("${CABIN_BRAND_ID[params.cabin]}") being wrong.`,
    );
    return [];
  }

  const cheapest = priced.reduce((best: any, offer: any) => {
    const miles = offer.offerPricing[0]?.totalAmt?.milesEquivalentPrice?.mileCnt ?? Infinity;
    const bestMiles = best.offerPricing[0]?.totalAmt?.milesEquivalentPrice?.mileCnt ?? Infinity;
    return miles < bestMiles ? offer : best;
  });

  const pricing = cheapest.offerPricing[0].totalAmt;
  return [
    {
      milesPrice: pricing.milesEquivalentPrice.mileCnt,
      taxesFeesCents: Math.round((pricing.currencyEquivalentPrice?.currencyAmt ?? 0) * 100),
      currency,
      stops: cheapest.additionalOfferProperties?.totalTripStopCnt ?? 0,
      rawPayload: cheapest,
    },
  ];
}
