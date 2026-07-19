# Airline Points Search

A point.me / pointsyeah-style award travel search tool. Give it an origin, a
date, a cabin class, a destination (a single city or a region like "Europe"),
and a loyalty program — it fans out searches across every relevant
destination airport and shows you the cheapest award options.

**Status:** prototype. Delta SkyMiles is the only supported program.

## How it works

- `apps/web` — Next.js app. Search form + results UI, plus API routes that
  create searches and enqueue work.
- `apps/scraper-worker` — Node worker. Consumes queued jobs, opens a
  headless Chromium page against delta.com (Playwright) and, from inside that
  page's own JS context, calls Delta's **flexible-dates calendar API**
  (`offer-api-prd.delta.com/prd/rm-offer-gql`) — verified against a real
  captured browser session, no cookies/auth required. Parsed results are
  written to Postgres.
- `packages/shared` — shared TypeScript types and the region → airport
  mapping (e.g. "Europe" → LHR, CDG, AMS, FRA, MAD, ...).
- Redis + BullMQ queue the per-destination search jobs so a region search
  (many airports × maybe multiple dates) runs with bounded concurrency and
  jittered pacing instead of hammering delta.com at once.

```
Search request (ATL → Europe, 2026-09-10, Business, Delta)
        │
        ▼
  expand region → [LHR, CDG, AMS, FRA, MAD, FCO, MUC, ZRH, DUB, BCN]
        │
        ▼
  one queue job per (origin, destination, date)  ── bounded concurrency ──▶ scraper-worker
        │                                                                        │
        ▼                                                                        ▼
  Postgres: searches / search_legs                                    Playwright → delta.com
                                                                                    │
        ◀────────────────────── flight_results ────────────────────────────────────┘
        │
        ▼
  web UI polls GET /api/search/:id, renders results grouped by destination
```

## Running locally

```bash
docker compose up -d          # Postgres + Redis
npm install
npm run db:migrate            # creates tables, seeds region data
npm run dev:worker             # in one terminal
npm run dev:web                 # in another
```

Web app: http://localhost:3000

## Important caveats

- This automates Delta's own website (no official award-search API exists).
  That's a Terms-of-Service gray area — fine for personal/research use, not
  something to expose publicly or scale up without Delta's involvement.
- Delta can change this endpoint or add bot detection at any time; nothing
  here is a stable, supported API.
- No login/session handling is implemented — none was needed for the
  calendar endpoint in the capture this was verified against.

## What's verified vs. what's still a guess

Verified against a real captured browser session (HAR) on 2026-07-19:
- The endpoint, request shape, and response shape in
  `apps/scraper-worker/src/scrapers/delta.ts` for **Main Cabin (economy)**.
- No cookies/auth are required for this specific call.

Still unverified / open work:
- **Cabin mapping.** Only `economy` → `"MAIN"` is confirmed. The
  `premium_economy`/`business`/`first` → brand-ID mappings in
  `CABIN_BRAND_ID` are guesses based on Delta's public cabin names, not
  confirmed to actually filter results. To verify: capture a HAR while
  explicitly selecting that cabin on delta.com before searching.
- **Flight-level detail.** This endpoint is Delta's calendar/flexible-dates
  view — it returns the cheapest price *per day*, not a specific itinerary,
  so `flightNumbers`/`departAt`/`arriveAt`/`durationMinutes` are currently
  always empty. Getting real flight times/numbers requires capturing the
  richer query that fires when you click from the calendar into one
  specific date's flight list.
