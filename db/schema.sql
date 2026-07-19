-- Region -> airport config lives in code (packages/shared/src/regions.ts),
-- not the database, since a prototype has no need to edit it at runtime.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS searches (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origin             text NOT NULL,
  destination_type   text NOT NULL,
  destination_region text,
  cabin              text NOT NULL,
  date_start         date NOT NULL,
  date_end           date NOT NULL,
  program            text NOT NULL,
  nonstop_only       boolean NOT NULL DEFAULT false,
  status             text NOT NULL DEFAULT 'pending',
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Idempotent for anyone who already ran the migration before this column existed.
ALTER TABLE searches ADD COLUMN IF NOT EXISTS nonstop_only boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS search_legs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id           uuid NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
  destination_airport text NOT NULL,
  search_date         date NOT NULL,
  status              text NOT NULL DEFAULT 'queued',
  error_message       text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_legs_search_id ON search_legs(search_id);

-- Supports the "don't re-scrape an identical leg within the TTL" cache check.
CREATE INDEX IF NOT EXISTS idx_search_legs_cache_lookup
  ON search_legs(destination_airport, search_date, created_at);

-- flight_numbers/depart_at/arrive_at/duration_minutes are nullable: Delta's
-- flexible-dates calendar endpoint (the only verified data source so far)
-- only returns a per-day cheapest price, not a specific itinerary. They get
-- populated once a flight-level search query is reverse-engineered.
CREATE TABLE IF NOT EXISTS flight_results (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leg_id              uuid NOT NULL REFERENCES search_legs(id) ON DELETE CASCADE,
  origin_airport      text NOT NULL,
  destination_airport text NOT NULL,
  cabin               text NOT NULL,
  flight_numbers      text[],
  miles_price         integer NOT NULL,
  taxes_fees_cents    integer NOT NULL,
  currency            text NOT NULL DEFAULT 'USD',
  stops               integer NOT NULL,
  depart_at           timestamptz,
  arrive_at           timestamptz,
  duration_minutes    integer,
  raw_payload         jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Idempotent for anyone who already ran the migration before this column
-- became nullable (safe to run repeatedly; no-op once already dropped).
ALTER TABLE flight_results ALTER COLUMN flight_numbers DROP NOT NULL;
ALTER TABLE flight_results ALTER COLUMN depart_at DROP NOT NULL;
ALTER TABLE flight_results ALTER COLUMN arrive_at DROP NOT NULL;
ALTER TABLE flight_results ALTER COLUMN duration_minutes DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_flight_results_leg_id ON flight_results(leg_id);
