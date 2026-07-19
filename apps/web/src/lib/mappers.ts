import type { FlightResult, Search, SearchLeg } from "@points-search/shared";

export function mapSearchRow(row: any): Search {
  return {
    id: row.id,
    origin: row.origin,
    destinationType: row.destination_type,
    destinationRegion: row.destination_region,
    cabin: row.cabin,
    dateStart: row.date_start,
    dateEnd: row.date_end,
    program: row.program,
    nonstopOnly: row.nonstop_only,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function mapSearchLegRow(row: any): SearchLeg {
  return {
    id: row.id,
    searchId: row.search_id,
    destinationAirport: row.destination_airport,
    searchDate: row.search_date,
    status: row.status,
    errorMessage: row.error_message,
  };
}

export function mapFlightResultRow(row: any): FlightResult {
  return {
    id: row.id,
    legId: row.leg_id,
    originAirport: row.origin_airport,
    destinationAirport: row.destination_airport,
    cabin: row.cabin,
    flightNumbers: row.flight_numbers ?? undefined,
    milesPrice: row.miles_price,
    taxesFeesCents: row.taxes_fees_cents,
    currency: row.currency,
    stops: row.stops,
    departAt: row.depart_at ?? undefined,
    arriveAt: row.arrive_at ?? undefined,
    durationMinutes: row.duration_minutes ?? undefined,
  };
}
