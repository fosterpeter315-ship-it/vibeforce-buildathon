# Airline Points Search

A point.me / pointsyeah-style award travel search tool. Give it an origin, a
date, a cabin class, a destination (a single city or a region like "Europe"),
and a loyalty program — it fans out searches across every relevant
destination airport and shows you the cheapest award options.

**Status:** prototype. Delta SkyMiles is the only supported program.

**This needs a real internet connection to do anything useful** — it
searches Delta's actual site. Run it on your own computer while connected to
wifi, not in a sandboxed/offline environment.

## Quick start (first time on this machine)

This is a small local web app, not a single file — it needs a couple of
background pieces running (a database and a search worker) alongside the
website itself. None of it gets hosted anywhere or exposed to the internet;
everything only talks to `localhost` on your own machine, plus outbound
requests to delta.com when you run a search.

**1. Install two programs, if you don't already have them:**

- **Node.js** — go to [nodejs.org](https://nodejs.org), download the "LTS"
  version, run the installer. This gives you the `node` and `npm` commands.
- **Docker Desktop** — go to [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/),
  download and install it, then **open the Docker Desktop app once** and
  leave it running in the background. This is what runs the small database
  and job queue this app needs.

**2. Unzip the project folder** wherever you like, then open a terminal
(Terminal.app on Mac, or Command Prompt/PowerShell on Windows) and `cd` into
that folder — e.g.:

```bash
cd ~/Downloads/airline-points-search
```

**3. Run these commands, in order, in that terminal:**

```bash
docker compose up -d      # starts the database + job queue in the background
npm install                # installs everything, including a headless browser (~300MB, one-time)
npm run db:migrate         # sets up the database tables
npm run dev                # starts the website + search worker together
```

`npm install` will take a few minutes the first time (it downloads a
headless Chromium browser for the search worker to use). Once `npm run dev`
prints that both `web` and `worker` are ready, open **http://localhost:3000**
in your browser.

Leave that terminal window open while you use the app — closing it stops
both the website and the search worker. Press `Ctrl+C` in the terminal to
stop everything when you're done.

## Running it again later

Once you've done the steps above once, next time you just need:

```bash
docker compose up -d   # if Docker Desktop was fully shut down
npm run dev
```

(Make sure Docker Desktop is open first.)

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

## If something goes wrong

- **`docker compose up -d` fails / "Cannot connect to the Docker daemon"** —
  Docker Desktop isn't running. Open the Docker Desktop app and wait for it
  to say it's running, then try again.
- **A search never finishes / always fails** — open the terminal window
  running `npm run dev` and look at the `worker` lines for an error message.
  Since cabin selection beyond Economy is unverified (see above), business
  or first-class searches are the most likely to come back empty or fail —
  try an Economy search first to confirm the basic pipeline works.
- **Port already in use** — something else on your machine is already using
  port 3000, 5432, or 6379. Close other terminal windows running this
  project, or restart your machine, and try again.
- **`[leg] ... FAILED — ... Delta offer API 444 ...`** — a `444` means
  Delta's server closed the connection with no response, almost always
  anti-bot/rate-limit protection reacting to automated-looking traffic (e.g.
  several requests firing at once). The defaults are already set to run one
  request at a time with a several-second delay between each — if you still
  see `444`s, wait a while before searching again rather than retrying
  repeatedly. This endpoint is unofficial and unsupported; Delta tightening
  bot detection on it is a real, expected risk, not a bug to "fix" by trying
  to look more convincing to their WAF.
