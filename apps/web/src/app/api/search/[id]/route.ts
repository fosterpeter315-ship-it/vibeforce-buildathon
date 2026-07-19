import { NextResponse } from "next/server";
import type { SearchResultsResponse } from "@points-search/shared";
import { pool } from "@/lib/db";
import { mapFlightResultRow, mapSearchLegRow, mapSearchRow } from "@/lib/mappers";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const { rows: searchRows } = await pool.query(`SELECT * FROM searches WHERE id = $1`, [id]);
  if (searchRows.length === 0) {
    return NextResponse.json({ error: "Search not found." }, { status: 404 });
  }

  const { rows: legRows } = await pool.query(
    `SELECT * FROM search_legs WHERE search_id = $1 ORDER BY destination_airport, search_date`,
    [id],
  );

  const { rows: resultRows } = await pool.query(
    `SELECT fr.* FROM flight_results fr
       JOIN search_legs sl ON sl.id = fr.leg_id
      WHERE sl.search_id = $1
      ORDER BY fr.miles_price ASC`,
    [id],
  );

  const body: SearchResultsResponse = {
    search: mapSearchRow(searchRows[0]),
    legs: legRows.map(mapSearchLegRow),
    results: resultRows.map(mapFlightResultRow),
  };

  return NextResponse.json(body);
}
