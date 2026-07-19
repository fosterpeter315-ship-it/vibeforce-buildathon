"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { REGIONS, type CabinClass, type SearchInput } from "@points-search/shared";

const CABIN_OPTIONS: { value: CabinClass; label: string }[] = [
  { value: "economy", label: "Economy" },
  { value: "premium_economy", label: "Premium Economy" },
  { value: "business", label: "Business" },
  { value: "first", label: "First" },
];

export function SearchForm() {
  const router = useRouter();
  const [origin, setOrigin] = useState("ATL");
  const [destinationMode, setDestinationMode] = useState<"region" | "airports">("region");
  const [region, setRegion] = useState(Object.keys(REGIONS)[0]);
  const [airportsText, setAirportsText] = useState("LHR, CDG, AMS");
  const [cabin, setCabin] = useState<CabinClass>("business");
  const [nonstopOnly, setNonstopOnly] = useState(false);
  const [dateStart, setDateStart] = useState("");
  const [flexible, setFlexible] = useState(false);
  const [dateEnd, setDateEnd] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!dateStart) {
      setError("Pick a departure date.");
      return;
    }

    const input: SearchInput = {
      origin: origin.trim().toUpperCase(),
      destination:
        destinationMode === "region"
          ? { type: "region", region }
          : {
              type: "airports",
              airports: airportsText
                .split(",")
                .map((code) => code.trim().toUpperCase())
                .filter(Boolean),
            },
      cabin,
      dateStart,
      dateEnd: flexible && dateEnd ? dateEnd : undefined,
      program: "delta",
      nonstopOnly,
    };

    setSubmitting(true);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error ?? "Search failed to start.");
      }
      router.push(`/search/${body.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  return (
    <form className="panel form-grid" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="origin">From</label>
        <input
          id="origin"
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          placeholder="ATL"
          maxLength={4}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="cabin">Cabin</label>
        <select id="cabin" value={cabin} onChange={(e) => setCabin(e.target.value as CabinClass)}>
          {CABIN_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="destinationMode">Destination</label>
        <select
          id="destinationMode"
          value={destinationMode}
          onChange={(e) => setDestinationMode(e.target.value as "region" | "airports")}
        >
          <option value="region">Region</option>
          <option value="airports">Specific airports</option>
        </select>
      </div>

      {destinationMode === "region" ? (
        <div className="field">
          <label htmlFor="region">Region</label>
          <select id="region" value={region} onChange={(e) => setRegion(e.target.value)}>
            {Object.keys(REGIONS).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="field">
          <label htmlFor="airports">Airports (comma-separated)</label>
          <input
            id="airports"
            value={airportsText}
            onChange={(e) => setAirportsText(e.target.value)}
            placeholder="LHR, CDG, AMS"
          />
        </div>
      )}

      <div className="field">
        <label htmlFor="dateStart">{flexible ? "Earliest date" : "Date"}</label>
        <input
          id="dateStart"
          type="date"
          value={dateStart}
          onChange={(e) => setDateStart(e.target.value)}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="program">Loyalty program</label>
        <select id="program" value="delta" disabled>
          <option value="delta">Delta SkyMiles</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="stops">Stops</label>
        <select
          id="stops"
          value={nonstopOnly ? "nonstop" : "any"}
          onChange={(e) => setNonstopOnly(e.target.value === "nonstop")}
        >
          <option value="any">Don&apos;t care (cheapest overall)</option>
          <option value="nonstop">Nonstop only</option>
        </select>
      </div>

      <div className="field span-2 checkbox-row">
        <input
          id="flexible"
          type="checkbox"
          checked={flexible}
          onChange={(e) => setFlexible(e.target.checked)}
        />
        <label htmlFor="flexible" style={{ margin: 0 }}>
          Flexible dates (search a range)
        </label>
      </div>

      {flexible && (
        <div className="field span-2">
          <label htmlFor="dateEnd">Latest date</label>
          <input
            id="dateEnd"
            type="date"
            value={dateEnd}
            onChange={(e) => setDateEnd(e.target.value)}
          />
        </div>
      )}

      {error && <div className="field span-2 error">{error}</div>}

      <div className="field span-2">
        <button className="primary" type="submit" disabled={submitting}>
          {submitting ? "Starting search..." : "Search award availability"}
        </button>
      </div>
    </form>
  );
}
