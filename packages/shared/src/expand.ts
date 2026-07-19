import type { DestinationSpec } from "./types";
import { resolveRegionAirports } from "./regions";

export function resolveDestinationAirports(spec: DestinationSpec): string[] {
  if (spec.type === "region") {
    return resolveRegionAirports(spec.region);
  }
  return spec.airports;
}

/** Inclusive list of YYYY-MM-DD dates between start and end. */
export function expandDateRange(dateStart: string, dateEnd: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${dateStart}T00:00:00Z`);
  const end = new Date(`${dateEnd}T00:00:00Z`);
  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}
