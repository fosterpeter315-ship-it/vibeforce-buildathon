# Airline Points Search

A point.me / pointsyeah-style award travel search tool. Give it an origin, a
date, a cabin class, a destination (a single city or a region like "Europe"),
and a loyalty program — it fans out searches across every relevant
destination airport and shows you the cheapest award options.

**Status:** prototype. Delta SkyMiles is the only supported program.

## How it works

- `apps/web` — Next.js app. Search form + results UI, plus API routes that
  create searches and enqueue work.
- `apps/scraper-worker` — Node worker. Consumes queued jobs, drives a
  headless Chromium browser (Playwright) through delta.com's real award
  search flow, and captures the JSON responses Delta's own frontend fetches
  (rather than scraping rendered HTML). Parsed results are written to
  Postgres.
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
- Delta can change their site or add bot detection at any time. The
  intercepted-JSON approach is more robust than DOM scraping, but not
  guaranteed to keep working.
- No login/session handling is implemented yet. If Delta ever gates award
  search behind authentication, the worker will need cookie/session
  persistence added.
