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
  headless Chromium page and **drives delta.com's actual search form** like a
  person would (selects one-way, enables "shop with miles," types the
  origin/destination/date, picks a cabin, hits search), then listens for
  whatever response comes back from Delta's offer API
  (`offer-api-prd.delta.com/prd/rm-offer-gql`). This replaced an earlier
  version that called that API directly with a synthesized request — direct
  calls got reliably blocked (`HTTP 444`) by Delta's bot protection, so
  driving the real UI is the more legitimate approach, even though it means
  the DOM selectors are unverified guesses (see below) rather than confirmed
  from a capture. Parsed results are written to Postgres.
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
- The **response-parsing logic** for the calendar/flexible-dates shape
  (`gqlOffersSets` / `itineraryDepartureDate`) in `parseOfferResponse()`,
  for **Main Cabin (economy)**.
- Calling that API directly (rather than through the real UI) works
  *functionally* but gets reliably blocked by Delta's bot protection
  (`HTTP 444`) — see the caveats above. That's why the scraper now drives
  the actual search form instead.

Still unverified / open work — all in `apps/scraper-worker/src/scrapers/delta.ts`:
- **Every DOM selector in `driveSearchForm()`** — trip-type toggle, "shop
  with miles" control, from/to fields, date field, cabin selector, search
  button. None of these have been confirmed against the live site. Each
  step logs `[delta-ui] ... step ok — <name>` on success, so if a search
  fails, the terminal will show exactly which step it got stuck on.
- **Cabin mapping.** `CABIN_UI_LABEL` guesses what text is clickable for
  each cabin (`"Main Cabin"`, `"Premium Select"`, `"Delta One"`, `"First
  Class"`) — unconfirmed beyond Economy.
- **Whether the real UI search flow even returns the calendar shape.** The
  original capture was of Delta's *flexible-dates calendar* specifically;
  the main one-way search button might trigger a different query with a
  different response shape entirely (Delta's frontend code references
  fields like `flightNumber`/`segments` elsewhere, suggesting a richer,
  differently-shaped response for actual flight results). If so,
  `parseOfferResponse()` will log a preview of the real payload instead of
  silently returning nothing — that preview is what to hand back for the
  next iteration.

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
- **`[leg] ... FAILED — UI step failed at "..." ...`** — the scraper drives
  the real delta.com search form, and one of its guessed selectors didn't
  match anything on the live page. The step name in the error (e.g. `"fill
  origin"`, `"select cabin"`) says exactly where it got stuck — that's
  where to fix a selector in `driveSearchForm()`.
- **`[delta-ui] ... no matching API response captured within 25s`** — the
  form steps all completed, but no response from Delta's offer API showed
  up. Likely the search never actually submitted (a step "succeeded" by
  clicking the wrong element) or Delta's page took longer than 25s to
  respond.
- **`[delta-ui] ... response didn't match the known calendar shape ...`**
  followed by a payload preview — a response came back, but it's not the
  calendar shape the parser understands. Share that preview and the parser
  can be extended to match the real shape.
- **Previously, direct API calls got `HTTP 444`** (Delta's server closing
  the connection — anti-bot protection). This endpoint is unofficial and
  unsupported either way; treat any of the above as an expected risk of
  automating a site that was never built to be automated, not bugs with a
  guaranteed fix.
