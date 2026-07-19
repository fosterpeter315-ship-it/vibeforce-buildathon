export type CabinClass = "economy" | "premium_economy" | "business" | "first";

export type LoyaltyProgram = "delta";

export type DestinationSpec =
  | { type: "region"; region: string }
  | { type: "airports"; airports: string[] };

/** What the search form submits. */
export interface SearchInput {
  origin: string;
  destination: DestinationSpec;
  cabin: CabinClass;
  /** Single date, or the start of a flexible date range. */
  dateStart: string;
  /** Optional end of a flexible date range (inclusive). Omit for a single-date search. */
  dateEnd?: string;
  program: LoyaltyProgram;
}

export type SearchStatus = "pending" | "running" | "done" | "failed";
export type SearchLegStatus = "queued" | "running" | "done" | "failed";

export interface Search {
  id: string;
  origin: string;
  destinationType: DestinationSpec["type"];
  destinationRegion: string | null;
  cabin: CabinClass;
  dateStart: string;
  dateEnd: string;
  program: LoyaltyProgram;
  status: SearchStatus;
  createdAt: string;
}

export interface SearchLeg {
  id: string;
  searchId: string;
  destinationAirport: string;
  searchDate: string;
  status: SearchLegStatus;
  errorMessage: string | null;
}

export interface FlightResult {
  id: string;
  legId: string;
  originAirport: string;
  destinationAirport: string;
  cabin: CabinClass;
  milesPrice: number;
  taxesFeesCents: number;
  currency: string;
  stops: number;
  /**
   * Delta's flexible-dates calendar endpoint (currently the only verified
   * data source) only gives a per-day cheapest price, not a specific
   * itinerary. These are populated once a flight-level search is wired up;
   * until then, results only carry price/stop info per date.
   */
  flightNumbers?: string[];
  departAt?: string;
  arriveAt?: string;
  durationMinutes?: number;
}

/** Payload for a single queued (origin, destination, date) scrape job. */
export interface SearchLegJob {
  legId: string;
  searchId: string;
  origin: string;
  destinationAirport: string;
  searchDate: string;
  cabin: CabinClass;
  program: LoyaltyProgram;
}

export const SEARCH_LEG_QUEUE = "search-leg";

/** Aggregated response shape the web UI polls for. */
export interface SearchResultsResponse {
  search: Search;
  legs: SearchLeg[];
  results: FlightResult[];
}
