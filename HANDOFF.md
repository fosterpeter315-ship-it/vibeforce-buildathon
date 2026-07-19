# Project Handoff — Airline Award-Points Search

> Context doc for a coding agent (e.g. ChatGPT Codex) picking this repo up
> cold. Read this first, then `README.md`.

## What this project is

A point.me / pointsyeah-style award-travel search tool. The user enters:

- an **origin** airport (e.g. ATL),
- a **destination** that is either a single city, a list of airports
  (LHR, CDG, AMS…), or a **region** (e.g. "Europe") that fans out to a
  curated airport list,
- a **date** (single or a flexible range),
- a **cabin** (economy / premium economy / business / first),
- **nonstop-only vs cheapest-overall**,
- a **loyalty program** (currently only Delta SkyMiles).

It fans the search out into one job per (origin, destination, date),
processes them with a bounded-concurrency queue, and shows the cheapest
award option per destination in a web UI, grouped by destination and sorted
by miles price.

## Current status (IMPORTANT — read before continuing)

**Everything works EXCEPT actually getting live data out of Delta.** The
architecture, UI, queue, database, region fan-out, nonstop filtering, and
even a fully-working browser automation that correctly fills Delta's real
search form are all done and verified. The blocker is that **Delta's
anti-bot protection rejects the automated search** with an error
(`#SFAF052_444` in the UI; raw `HTTP 444` when the API was called directly).

Two independent approaches were tried and BOTH hit the same 444:

1. **Direct API call** to Delta's internal GraphQL offers endpoint
   (`offer-api-prd.delta.com/prd/rm-offer-gql`), reverse-engineered from a
   real HAR capture. Worked functionally, then got reliably 444-blocked.
2. **Full UI automation** with Playwright driving the real delta.com form
   (this is the current state of `scrapers/delta.ts`). The form now fills
   in **perfectly** — trip type, shop-with-miles, origin, destination,
   date-picker, submit — confirmed by screenshot. But on submit, Delta's
   backend returns the `#SFAF052_444` error page instead of results.

**Conclusion:** This is bot detection (Playwright exposes
`navigator.webdriver` and other automation signals). Getting past it would
require bot-detection *evasion* (fingerprint/stealth spoofing). The prior
agent deliberately did NOT do this and recommended against it — it means
deliberately defeating a company's anti-abuse protections and is against
Delta's ToS. **Do not pursue stealth/evasion.**

## RECOMMENDED NEXT STEP: swap Delta scraping for the seats.aero API

The clean, legal, reliable path — and what point.me / pointsyeah actually
use under the hood — is a licensed award-availability data API. The user is
considering **seats.aero**:

- ~**$9.99/month Pro plan**, API access included (no separate API fee).
- ~**1,000 API calls/day**, fine for this use case (~10 calls per region
  search → ~100 searches/day).
- Personal/non-commercial use is allowed; commercial use needs a written
  agreement.
- Covers ~24 airline programs (Delta, United, Aeroplan, Flying Blue, …), so
  the app could expand well beyond Delta.
- Developer docs: https://developers.seats.aero/ — the key endpoint is the
  **cached availability search** (bulk availability by route/date/program),
  which returns structured JSON with mileage cost, cabin, direct/stops, and
  taxes. Auth is an API key via a `Partner-Authorization` header.

### The actual task to implement seats.aero

The ONLY module that needs replacing is
`apps/scraper-worker/src/scrapers/delta.ts`. Its public contract is:

```ts
export interface DeltaSearchParams {
  origin: string;
  destination: string;
  date: string;          // YYYY-MM-DD
  cabin: CabinClass;
  nonstopOnly: boolean;
}
export async function runDeltaSearch(params): Promise<ParsedFlight[]>
```

Keep that same function signature (or rename to `runAwardSearch` and update
the one caller in `apps/scraper-worker/src/index.ts`). Replace its body with
a `fetch` to seats.aero's availability API using an API key from
`process.env.SEATS_AERO_API_KEY`. Map the response into `ParsedFlight`:

```ts
export interface ParsedFlight {
  milesPrice: number;        // mileage cost of the cheapest matching offer
  taxesFeesCents: number;    // taxes/fees in cents
  currency: string;          // e.g. "USD"
  stops: number;             // 0 = nonstop
  flightNumbers?: string[];  // optional; fill if the API provides it
  departAt?: string;         // optional ISO timestamp
  arriveAt?: string;         // optional
  durationMinutes?: number;  // optional
  rawPayload?: unknown;      // stash the raw offer for debugging
}
```

Selection logic to preserve from the current code:
- If `nonstopOnly`, filter to offers with `stops === 0` before picking.
- Return the single cheapest (by `milesPrice`) matching offer for that
  (origin, destination, date, cabin). Returning an empty array = "no
  availability" (the UI handles that).
- Delta-only is a filter on the seats.aero `source`/program field if the
  user wants to stay Delta-only; otherwise allow any program and add the
  program name to the result (would need a small `ParsedFlight` + UI tweak).

Playwright, the `debug-screenshots/` machinery, the cookie-banner handling,
and all the DOM-driving code can be **deleted** once seats.aero works —
none of it is needed against a real API. Remove the `playwright` dependency
and the `postinstall: playwright install chromium` script too; that removes
the ~300MB browser download and simplifies setup a lot.

## Architecture (unchanged regardless of data source)

Monorepo, npm workspaces:

- `apps/web` — Next.js 15 (App Router, React 19, TypeScript). Search form,
  results UI (polls for results), and API routes:
  - `POST /api/search` — validates input, expands region→airports and
    date-range→dates, inserts a `searches` row + one `search_legs` row per
    (destination, date), enqueues one BullMQ job per leg.
  - `GET /api/search/:id` — returns the search, its legs (with status), and
    all flight_results so far. The UI polls this every 2.5s.
- `apps/scraper-worker` — Node + TypeScript (tsx) BullMQ worker. Consumes
  leg jobs, calls the data source (currently Delta; swap to seats.aero),
  writes `flight_results`, marks legs done/failed, marks the parent search
  done when all legs finish. Concurrency 1 + a delay between jobs (was to be
  polite to Delta; can be raised for a real API). Has a short-TTL result
  cache (`findCachedLeg`) to avoid duplicate fetches within 15 min.
- `packages/shared` — shared TS types (`SearchInput`, `Search`, `SearchLeg`,
  `FlightResult`, `SearchLegJob`, `CabinClass`, etc.), the region→airport
  map (`regions.ts`), airport metadata (`airports.ts`), and expansion
  helpers (`expand.ts`).
- **Postgres** (`db/schema.sql`) — `searches`, `search_legs`,
  `flight_results` tables. Migration runner: `scripts/migrate.mjs`.
- **Redis + BullMQ** — the job queue.
- `docker-compose.yml` — local Postgres + Redis.

Data flow:

```
POST /api/search
  → expand region → [LHR, CDG, AMS, …], expand date range
  → insert searches + search_legs rows
  → enqueue one BullMQ job per (origin, destination, date)
        → worker: runAwardSearch(...) → insert flight_results
  → UI polls GET /api/search/:id, renders results grouped by destination
```

## How to run locally

```bash
docker compose up -d          # Postgres + Redis
npm install
npm run db:migrate
npm run dev                    # runs web + worker together (concurrently)
# open http://localhost:3000
```

Env vars (see `.env.example`): `DATABASE_URL`, `REDIS_URL`, and
scraper-worker knobs. After the swap, add `SEATS_AERO_API_KEY`.

## Tech notes / gotchas

- ESM throughout. `packages/shared` is consumed as source (no build step);
  its imports are extensionless and `apps/web` transpiles it via
  `transpilePackages`.
- `flight_results` flight-level columns (flight_numbers, depart_at,
  arrive_at, duration_minutes) are nullable — Delta's calendar endpoint only
  gave per-day cheapest price, no itinerary. seats.aero may provide more;
  fill them if available.
- `SCRAPE_HEADLESS=false` in `.env` was only for watching the Playwright
  browser during debugging; irrelevant after the seats.aero swap.
- Cabin mapping beyond economy was never verified against Delta. seats.aero
  has explicit cabin fields, so this becomes clean.
- Everything typechecks: `npm run typecheck`.

## What NOT to do

- Do not add Playwright stealth / fingerprint spoofing / anything whose
  purpose is to defeat Delta's (or any site's) bot detection.
- Do not scrape delta.com — it's blocked and against their ToS. Use a
  licensed data source.
