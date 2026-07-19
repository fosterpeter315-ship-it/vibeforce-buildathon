/**
 * Curated region -> airport mappings. This is hand-maintained config, not
 * scraped data — it just controls which airports we fan a region search out
 * to. Keep lists to the airports Delta (or its joint-venture/SkyTeam
 * partners) actually serves with meaningful award availability; a longer
 * list only means more scrape jobs per search.
 */
export const REGIONS: Record<string, string[]> = {
  Europe: [
    "LHR", // London Heathrow
    "CDG", // Paris Charles de Gaulle
    "AMS", // Amsterdam Schiphol
    "FRA", // Frankfurt
    "MAD", // Madrid
    "FCO", // Rome Fiumicino
    "MUC", // Munich
    "ZRH", // Zurich
    "DUB", // Dublin
    "BCN", // Barcelona
  ],
  Caribbean: ["SJU", "NAS", "MBJ", "PUJ", "AUA", "STT"],
  CentralAmerica: ["CUN", "SJO", "PTY", "GUA"],
  SouthAmerica: ["GRU", "EZE", "BOG", "LIM", "SCL"],
  Asia: ["NRT", "HND", "ICN", "PVG", "PEK", "HKG", "SIN", "BKK"],
};

/** Bounds fan-out volume per region search regardless of list length above. */
export const MAX_AIRPORTS_PER_REGION = 10;

export function resolveRegionAirports(region: string): string[] {
  const airports = REGIONS[region];
  if (!airports) {
    throw new Error(`Unknown region: ${region}`);
  }
  return airports.slice(0, MAX_AIRPORTS_PER_REGION);
}
