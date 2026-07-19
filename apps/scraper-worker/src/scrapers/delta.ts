import { chromium, type Page } from "playwright";
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

/**
 * Substring match, not exact: we want to capture this call regardless of
 * which "x-app-route" the real UI flow ends up using (the calendar view we
 * originally captured used "dates"; the main one-way search flow may use a
 * different route with a different response shape — see parseOfferResponse
 * below for how that's handled).
 */
const OFFER_API_URL_SUBSTRING = "offer-api-prd.delta.com/prd/rm-offer-gql";

/**
 * UI labels as they're guessed to appear on delta.com's cabin selector.
 * UNVERIFIED — only "economy" maps to data we've actually confirmed works
 * (via the direct-API-call approach, not this UI flow). The others are
 * guesses based on Delta's public cabin naming.
 */
const CABIN_UI_LABEL: Record<CabinClass, string> = {
  economy: "Main Cabin",
  premium_economy: "Premium Select",
  business: "Delta One",
  first: "First Class",
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Drives the actual delta.com UI like a real user would, instead of calling
 * the internal API directly. UNVERIFIED — none of these selectors have been
 * confirmed against the live site. Each step is named and logged so a
 * failure points at exactly which step to fix, rather than a blind retry.
 */
async function driveSearchForm(page: Page, params: DeltaSearchParams, label: string): Promise<void> {
  const steps: Array<[string, () => Promise<void>]> = [
    [
      "load homepage",
      async () => {
        await page.goto("https://www.delta.com/", { waitUntil: "domcontentloaded" });
        // Best-effort extra settle time: a lot of sites hydrate their real
        // interactive widgets well after domcontentloaded fires. Not fatal
        // if the page never goes fully idle (e.g. background analytics).
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      },
    ],
    [
      "dismiss cookie/privacy banner (best-effort, ok if none appears)",
      async () => {
        const candidates = [
          page.getByRole("button", { name: /accept all|accept cookies|i accept|got it|agree/i }),
          page.locator("#onetrust-accept-btn-handler"),
        ];
        for (const locator of candidates) {
          try {
            await locator.first().click({ timeout: 3_000 });
            return;
          } catch {
            // try the next candidate; no banner matching this one
          }
        }
      },
    ],
    [
      "open trip type dropdown",
      async () => {
        // A live test confirmed "One Way" exists in the DOM as
        // <span class="dropdown__list-item-text">One Way</span> but is
        // reported "not visible" — i.e. it's a closed dropdown's list item.
        // Clicking the currently-shown default ("Round Trip") should open it.
        await page.getByText(/round trip/i).first().click({ timeout: 10_000 });
      },
    ],
    [
      "select One Way trip type",
      async () => {
        await page.getByText(/^one way$/i).first().click({ timeout: 10_000 });
      },
    ],
    [
      "enable Shop/Book with Miles",
      async () => {
        await page
          .getByText(/shop with miles|book with miles/i)
          .first()
          .click({ timeout: 10_000 });
      },
    ],
    [
      "fill origin",
      async () => {
        const field = page.getByPlaceholder(/from/i).or(page.getByLabel(/^from$/i)).first();
        await field.click({ timeout: 10_000 });
        await field.fill(params.origin);
        await page.getByText(new RegExp(params.origin, "i")).first().click({ timeout: 10_000 });
      },
    ],
    [
      "fill destination",
      async () => {
        const field = page.getByPlaceholder(/^to$/i).or(page.getByLabel(/^to$/i)).first();
        await field.click({ timeout: 10_000 });
        await field.fill(params.destination);
        await page
          .getByText(new RegExp(params.destination, "i"))
          .first()
          .click({ timeout: 10_000 });
      },
    ],
    [
      "set depart date",
      async () => {
        const field = page.getByPlaceholder(/depart/i).or(page.getByLabel(/depart/i)).first();
        await field.click({ timeout: 10_000 });
        await field.fill(params.date);
      },
    ],
    [
      "select cabin",
      async () => {
        await page
          .getByText(CABIN_UI_LABEL[params.cabin], { exact: false })
          .first()
          .click({ timeout: 10_000 });
      },
    ],
    [
      "submit search",
      async () => {
        await page
          .getByRole("button", { name: /search|find flights/i })
          .first()
          .click({ timeout: 10_000 });
      },
    ],
  ];

  for (const [name, action] of steps) {
    try {
      await action();
      console.log(`[delta-ui] ${label}: step ok — ${name}`);
    } catch (err) {
      throw new Error(
        `UI step failed at "${name}" — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

export async function runDeltaSearch(params: DeltaSearchParams): Promise<ParsedFlight[]> {
  const label = `${params.origin}->${params.destination} ${params.date} (${params.cabin}${params.nonstopOnly ? ", nonstop" : ""})`;
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

    let capturedPayload: unknown = null;
    page.on("response", async (response) => {
      if (!response.url().includes(OFFER_API_URL_SUBSTRING) || capturedPayload) return;
      try {
        capturedPayload = await response.json();
        console.log(`[delta-ui] ${label}: captured response (status ${response.status()})`);
      } catch {
        console.log(`[delta-ui] ${label}: matching response wasn't JSON or was already consumed`);
      }
    });

    await driveSearchForm(page, params, label);

    const deadline = Date.now() + 25_000;
    while (!capturedPayload && Date.now() < deadline) {
      await sleep(500);
    }

    if (!capturedPayload) {
      console.log(`[delta-ui] ${label}: no matching API response captured within 25s`);
      return [];
    }

    return parseOfferResponse(capturedPayload, params, label);
  } finally {
    await browser.close();
  }
}

/**
 * Handles the calendar/flexible-dates response shape (gqlOffersSets +
 * itineraryDepartureDate), which is the only shape confirmed against real
 * data so far. If the UI flow above ends up triggering a different query
 * (e.g. the main flight-list search, not the calendar), this shape won't
 * match — in which case a preview of the actual payload is logged so the
 * real shape can be added here next.
 */
function parseOfferResponse(payload: unknown, params: DeltaSearchParams, label: string): ParsedFlight[] {
  const search = (payload as any)?.data?.gqlSearchOffers;
  const offerSets: any[] = search?.gqlOffersSets ?? [];

  if (offerSets.length === 0) {
    console.log(
      `[delta-ui] ${label}: response didn't match the known calendar shape (no gqlOffersSets). ` +
        `Payload preview: ${JSON.stringify(payload).slice(0, 2000)}`,
    );
    if ((payload as any)?.errors) {
      console.log(`[delta-ui] ${label}: GraphQL errors:`, JSON.stringify((payload as any).errors));
    }
    return [];
  }

  const currency: string =
    search?.offerDataList?.pricingOptions?.[0]?.pricingOptionDetail?.currencyCode ?? "USD";

  const daySet = offerSets.find((set) => set.itineraryDepartureDate === params.date);
  if (!daySet) {
    const available = offerSets.map((s) => s.itineraryDepartureDate);
    console.log(`[delta-ui] ${label}: no matching day in response. Dates returned: ${available.join(", ")}`);
    return [];
  }

  let priced = (daySet.offers ?? []).filter((offer: any) => offer.offerPricing?.length);
  const totalOffers = (daySet.offers ?? []).length;
  if (params.nonstopOnly) {
    priced = priced.filter(
      (offer: any) => (offer.additionalOfferProperties?.totalTripStopCnt ?? 0) === 0,
    );
  }
  if (priced.length === 0) {
    console.log(
      `[delta-ui] ${label}: day found but 0 usable offers (${totalOffers} total offers). ` +
        `If cabin is not economy, the CABIN_UI_LABEL guess ("${CABIN_UI_LABEL[params.cabin]}") may not have matched anything clickable.`,
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
