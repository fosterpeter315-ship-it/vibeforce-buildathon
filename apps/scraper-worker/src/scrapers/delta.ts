import { chromium } from "playwright";
import type { CabinClass } from "@points-search/shared";
import { env } from "../env.js";

export interface ParsedFlight {
  flightNumbers: string[];
  milesPrice: number;
  taxesFeesCents: number;
  currency: string;
  stops: number;
  departAt: string;
  arriveAt: string;
  durationMinutes: number;
  rawPayload?: unknown;
}

export interface DeltaSearchParams {
  origin: string;
  destination: string;
  date: string; // YYYY-MM-DD
  cabin: CabinClass;
}

const CABIN_LABEL: Record<CabinClass, string> = {
  economy: "Main Cabin",
  premium_economy: "Premium Select",
  business: "Delta One",
  first: "Delta One",
};

/**
 * NOT YET VERIFIED AGAINST THE LIVE SITE.
 *
 * delta.com's award-search UI and the internal JSON endpoint it calls are
 * both unpublished and change without notice, so the URL pattern, DOM
 * selectors, and response shape below are a best-effort starting point, not
 * a confirmed contract. Before this scraper will return real data:
 *
 *   1. Open delta.com's award search in a real browser with devtools open,
 *      run a one-way search, and find the XHR/fetch call that returns the
 *      flight/price list (Network tab, filter by Fetch/XHR).
 *   2. Replace AWARD_RESPONSE_URL_PATTERN below with a regex matching that
 *      request's URL.
 *   3. Replace parseDeltaResponse() with logic that matches that response's
 *      actual JSON shape.
 *   4. Replace the form-filling selectors in runDeltaSearch() with whatever
 *      delta.com currently renders (data-testid attributes are more stable
 *      than classnames, if present).
 */
const AWARD_RESPONSE_URL_PATTERN = /delta\.com\/.*\/(shop|search).*award/i;

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

    let capturedPayload: unknown = null;
    page.on("response", async (response) => {
      if (!AWARD_RESPONSE_URL_PATTERN.test(response.url())) return;
      try {
        capturedPayload = await response.json();
      } catch {
        // Non-JSON or already-consumed response body; ignore.
      }
    });

    await page.goto("https://www.delta.com/flight-search/book-a-flight", {
      waitUntil: "domcontentloaded",
    });

    await page.getByRole("radio", { name: /one way/i }).click();
    await page.getByLabel(/shop with miles/i).check();
    await page.getByLabel(/from/i).fill(params.origin);
    await page.getByLabel(/to/i).fill(params.destination);
    await page.getByLabel(/depart/i).fill(params.date);
    await page.getByLabel(/cabin/i).selectOption({ label: CABIN_LABEL[params.cabin] });
    await page.getByRole("button", { name: /search|find flights/i }).click();

    await page.waitForResponse(AWARD_RESPONSE_URL_PATTERN, { timeout: 30_000 }).catch(() => {
      // Fall through; capturedPayload stays null and we return no results below.
    });

    if (!capturedPayload) {
      return [];
    }
    return parseDeltaResponse(capturedPayload, params);
  } finally {
    await browser.close();
  }
}

/** Placeholder parser — see the module-level TODO above. */
function parseDeltaResponse(payload: unknown, params: DeltaSearchParams): ParsedFlight[] {
  const offers = (payload as { offers?: unknown[] })?.offers;
  if (!Array.isArray(offers)) return [];

  return offers.flatMap((offer): ParsedFlight[] => {
    const o = offer as Record<string, any>;
    if (!o?.milesPrice || !o?.segments) return [];
    return [
      {
        flightNumbers: (o.segments as any[]).map((s) => `${s.carrierCode}${s.flightNumber}`),
        milesPrice: Number(o.milesPrice),
        taxesFeesCents: Math.round(Number(o.taxesFees ?? 0) * 100),
        currency: o.currency ?? "USD",
        stops: Math.max((o.segments as any[]).length - 1, 0),
        departAt: o.departureDateTime,
        arriveAt: o.arrivalDateTime,
        durationMinutes: Number(o.durationMinutes ?? 0),
        rawPayload: o,
      },
    ];
  });
}
