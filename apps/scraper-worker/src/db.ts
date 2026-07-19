import pg from "pg";
import type { CabinClass, LoyaltyProgram } from "@points-search/shared";
import { env } from "./env.js";
import type { ParsedFlight } from "./scrapers/delta.js";

export const pool = new pg.Pool({ connectionString: env.databaseUrl });

export async function markLegStatus(
  legId: string,
  status: "running" | "done" | "failed",
  errorMessage?: string,
): Promise<void> {
  await pool.query(
    `UPDATE search_legs SET status = $2, error_message = $3 WHERE id = $1`,
    [legId, status, errorMessage ?? null],
  );
}

export async function insertFlightResults(
  legId: string,
  origin: string,
  destinationAirport: string,
  cabin: CabinClass,
  flights: ParsedFlight[],
): Promise<void> {
  for (const flight of flights) {
    await pool.query(
      `INSERT INTO flight_results
        (leg_id, origin_airport, destination_airport, cabin, flight_numbers,
         miles_price, taxes_fees_cents, currency, stops, depart_at, arrive_at,
         duration_minutes, raw_payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        legId,
        origin,
        destinationAirport,
        cabin,
        flight.flightNumbers,
        flight.milesPrice,
        flight.taxesFeesCents,
        flight.currency,
        flight.stops,
        flight.departAt,
        flight.arriveAt,
        flight.durationMinutes,
        flight.rawPayload ?? null,
      ],
    );
  }
}

/**
 * If an identical (origin, destination, date, cabin, program) leg completed
 * successfully within the cache TTL, reuse its results instead of scraping again.
 */
export async function findCachedLeg(params: {
  origin: string;
  destinationAirport: string;
  searchDate: string;
  cabin: CabinClass;
  program: LoyaltyProgram;
  ttlMinutes: number;
}): Promise<{ legId: string } | null> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT sl.id
       FROM search_legs sl
       JOIN searches s ON s.id = sl.search_id
      WHERE s.origin = $1
        AND sl.destination_airport = $2
        AND sl.search_date = $3
        AND s.cabin = $4
        AND s.program = $5
        AND sl.status = 'done'
        AND sl.created_at > now() - ($6 || ' minutes')::interval
      ORDER BY sl.created_at DESC
      LIMIT 1`,
    [
      params.origin,
      params.destinationAirport,
      params.searchDate,
      params.cabin,
      params.program,
      params.ttlMinutes,
    ],
  );
  return rows[0] ? { legId: rows[0].id } : null;
}

export async function copyResultsToLeg(fromLegId: string, toLegId: string): Promise<void> {
  await pool.query(
    `INSERT INTO flight_results
       (leg_id, origin_airport, destination_airport, cabin, flight_numbers,
        miles_price, taxes_fees_cents, currency, stops, depart_at, arrive_at,
        duration_minutes, raw_payload)
     SELECT $2, origin_airport, destination_airport, cabin, flight_numbers,
            miles_price, taxes_fees_cents, currency, stops, depart_at, arrive_at,
            duration_minutes, raw_payload
       FROM flight_results
      WHERE leg_id = $1`,
    [fromLegId, toLegId],
  );
}

/** Marks the parent search 'done' once every leg has finished (done or failed). */
export async function maybeCompleteSearch(searchId: string): Promise<void> {
  const { rows } = await pool.query<{ remaining: string }>(
    `SELECT count(*) AS remaining
       FROM search_legs
      WHERE search_id = $1 AND status IN ('queued', 'running')`,
    [searchId],
  );
  if (Number(rows[0]?.remaining ?? 0) === 0) {
    await pool.query(`UPDATE searches SET status = 'done' WHERE id = $1`, [searchId]);
  }
}
