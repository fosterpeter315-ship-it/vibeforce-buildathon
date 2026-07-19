import { NextResponse } from "next/server";
import {
  expandDateRange,
  resolveDestinationAirports,
  type SearchInput,
  type SearchLegJob,
} from "@points-search/shared";
import { pool } from "@/lib/db";
import { searchLegQueue } from "@/lib/queue";

export async function POST(request: Request): Promise<NextResponse> {
  const input = (await request.json()) as SearchInput;

  if (!input.origin || !input.destination || !input.dateStart || !input.cabin || !input.program) {
    return NextResponse.json({ error: "Missing required search fields." }, { status: 400 });
  }

  const dateEnd = input.dateEnd ?? input.dateStart;
  let airports: string[];
  try {
    airports = resolveDestinationAirports(input.destination);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid destination." },
      { status: 400 },
    );
  }
  const dates = expandDateRange(input.dateStart, dateEnd);

  const { rows: searchRows } = await pool.query(
    `INSERT INTO searches (origin, destination_type, destination_region, cabin, date_start, date_end, program, nonstop_only, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
     RETURNING id`,
    [
      input.origin,
      input.destination.type,
      input.destination.type === "region" ? input.destination.region : null,
      input.cabin,
      input.dateStart,
      dateEnd,
      input.program,
      input.nonstopOnly ?? false,
    ],
  );
  const searchId: string = searchRows[0].id;

  const jobs: { legId: string; job: SearchLegJob }[] = [];
  for (const destinationAirport of airports) {
    for (const searchDate of dates) {
      const { rows: legRows } = await pool.query(
        `INSERT INTO search_legs (search_id, destination_airport, search_date, status)
         VALUES ($1, $2, $3, 'queued')
         RETURNING id`,
        [searchId, destinationAirport, searchDate],
      );
      const legId: string = legRows[0].id;
      jobs.push({
        legId,
        job: {
          legId,
          searchId,
          origin: input.origin,
          destinationAirport,
          searchDate,
          cabin: input.cabin,
          program: input.program,
          nonstopOnly: input.nonstopOnly ?? false,
        },
      });
    }
  }

  await pool.query(`UPDATE searches SET status = 'running' WHERE id = $1`, [searchId]);
  await searchLegQueue.addBulk(
    jobs.map(({ legId, job }) => ({ name: "search-leg", data: job, opts: { jobId: legId } })),
  );

  return NextResponse.json({ id: searchId });
}
