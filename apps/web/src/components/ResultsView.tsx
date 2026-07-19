"use client";

import { useEffect, useRef, useState } from "react";
import type { SearchResultsResponse } from "@points-search/shared";
import { formatCents, formatDateTime, formatDuration, formatMiles, formatStops } from "@/lib/format";
import { parseJsonResponse } from "@/lib/http";

const POLL_INTERVAL_MS = 2500;

export function ResultsView({ searchId }: { searchId: string }) {
  const [data, setData] = useState<SearchResultsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/search/${searchId}`);
        const body = await parseJsonResponse(res);
        if (!res.ok) throw new Error(body.error ?? "Failed to load search.");
        if (cancelled) return;
        setData(body);
        if (body.search.status === "done" && timerRef.current) {
          clearInterval(timerRef.current);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    }

    poll();
    timerRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [searchId]);

  if (error) return <div className="error">{error}</div>;
  if (!data) return <p className="empty-note">Loading search...</p>;

  const { search, legs, results } = data;
  const legsDone = legs.filter((l) => l.status === "done" || l.status === "failed").length;
  const progressPct = legs.length === 0 ? 0 : Math.round((legsDone / legs.length) * 100);

  const legDateById = new Map(legs.map((l) => [l.id, l.searchDate]));
  const byDestination = new Map<string, typeof results>();
  for (const r of results) {
    const list = byDestination.get(r.destinationAirport) ?? [];
    list.push(r);
    byDestination.set(r.destinationAirport, list);
  }
  const destinations = [...new Set(legs.map((l) => l.destinationAirport))].sort((a, b) => {
    const minA = Math.min(...(byDestination.get(a)?.map((r) => r.milesPrice) ?? [Infinity]));
    const minB = Math.min(...(byDestination.get(b)?.map((r) => r.milesPrice) ?? [Infinity]));
    return minA - minB;
  });

  return (
    <div>
      <div className="summary-bar">
        <h1 style={{ margin: 0 }}>
          {search.origin} &rarr; {search.destinationRegion ?? "selected airports"}
        </h1>
        <span className={`status-pill ${search.status}`}>{search.status}</span>
      </div>
      <p className="result-meta" style={{ marginBottom: "0.5rem" }}>
        {search.cabin.replace("_", " ")} &middot; {search.dateStart}
        {search.dateEnd !== search.dateStart ? ` to ${search.dateEnd}` : ""} &middot;{" "}
        {search.program === "delta" ? "Delta SkyMiles" : search.program} &middot;{" "}
        {search.nonstopOnly ? "Nonstop only" : "Cheapest overall"}
      </p>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${progressPct}%` }} />
      </div>
      <p className="result-meta" style={{ marginTop: "-1rem", marginBottom: "1.5rem" }}>
        {legsDone}/{legs.length} destination searches complete
      </p>

      {destinations.map((destination) => {
        const legsForDest = legs.filter((l) => l.destinationAirport === destination);
        const stillWorking = legsForDest.some(
          (l) => l.status === "queued" || l.status === "running",
        );
        const flights = (byDestination.get(destination) ?? []).sort(
          (a, b) => a.milesPrice - b.milesPrice,
        );

        return (
          <div className="destination-group" key={destination}>
            <div className="destination-heading">{destination}</div>
            {flights.map((f) => {
              const hasFlightDetail = Boolean(f.flightNumbers && f.departAt && f.arriveAt);
              return (
                <div className="result-card" key={f.id}>
                  <div>
                    <div className="result-meta">
                      {hasFlightDetail ? f.flightNumbers!.join(" + ") + " · " : ""}
                      {formatStops(f.stops)}
                      {f.durationMinutes != null ? ` · ${formatDuration(f.durationMinutes)}` : ""}
                    </div>
                    <div className="result-meta">
                      {hasFlightDetail
                        ? `${formatDateTime(f.departAt!)} → ${formatDateTime(f.arriveAt!)}`
                        : `${legDateById.get(f.legId) ?? ""} — exact flight times not yet available`}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="result-miles">{formatMiles(f.milesPrice)}</div>
                    <div className="result-meta">+ {formatCents(f.taxesFeesCents)} taxes/fees</div>
                  </div>
                </div>
              );
            })}
            {flights.length === 0 && (
              <p className="empty-note">
                {stillWorking ? "Searching..." : "No award availability found."}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
