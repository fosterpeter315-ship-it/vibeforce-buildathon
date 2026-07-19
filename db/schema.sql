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
  status             text NOT NULL DEFAULT 'pending',
  created_at         timestamptz NOT NULL DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS flight_results (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leg_id              uuid NOT NULL REFERENCES search_legs(id) ON DELETE CASCADE,
  origin_airport      text NOT NULL,
  destination_airport text NOT NULL,
  cabin               text NOT NULL,
  flight_numbers      text[] NOT NULL,
  miles_price         integer NOT NULL,
  taxes_fees_cents    integer NOT NULL,
  currency            text NOT NULL DEFAULT 'USD',
  stops               integer NOT NULL,
  depart_at           timestamptz NOT NULL,
  arrive_at           timestamptz NOT NULL,
  duration_minutes    integer NOT NULL,
  raw_payload         jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flight_results_leg_id ON flight_results(leg_id);
