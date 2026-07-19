import { Worker, type Job } from "bullmq";
import type { SearchLegJob } from "@points-search/shared";
import { env } from "./env.js";
import { createRedisConnection, SEARCH_LEG_QUEUE } from "./queue.js";
import { runDeltaSearch } from "./scrapers/delta.js";
import {
  copyResultsToLeg,
  findCachedLeg,
  insertFlightResults,
  markLegStatus,
  maybeCompleteSearch,
} from "./db.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processLeg(job: Job<SearchLegJob>): Promise<void> {
  const { legId, searchId, origin, destinationAirport, searchDate, cabin, program, nonstopOnly } =
    job.data;
  const label = `${origin}->${destinationAirport} ${searchDate} (${cabin}${nonstopOnly ? ", nonstop" : ""})`;
  console.log(`[leg] ${label}: picked up job ${job.id}`);

  // Guaranteed spacing (plus extra random jitter on top) so a region search
  // never hits delta.com in a burst — see the note on env.concurrency.
  await sleep(env.minDelayMs + Math.random() * env.jitterMs);
  await markLegStatus(legId, "running");

  try {
    const cached = await findCachedLeg({
      origin,
      destinationAirport,
      searchDate,
      cabin,
      program,
      nonstopOnly,
      ttlMinutes: env.cacheTtlMinutes,
    });

    if (cached) {
      console.log(
        `[leg] ${label}: reusing cached leg ${cached.legId} (within ${env.cacheTtlMinutes}min TTL) instead of calling Delta again`,
      );
      await copyResultsToLeg(cached.legId, legId);
    } else {
      console.log(`[leg] ${label}: no fresh cache hit, calling Delta now`);
      const flights = await runDeltaSearch({
        origin,
        destination: destinationAirport,
        date: searchDate,
        cabin,
        nonstopOnly,
      });
      console.log(`[leg] ${label}: Delta call returned ${flights.length} usable offer(s)`);
      await insertFlightResults(legId, origin, destinationAirport, cabin, flights);
    }

    await markLegStatus(legId, "done");
  } catch (err) {
    console.log(`[leg] ${label}: FAILED —`, err instanceof Error ? err.message : String(err));
    await markLegStatus(legId, "failed", err instanceof Error ? err.message : String(err));
  } finally {
    await maybeCompleteSearch(searchId);
  }
}

const worker = new Worker<SearchLegJob>(SEARCH_LEG_QUEUE, processLeg, {
  connection: createRedisConnection(),
  concurrency: env.concurrency,
});

worker.on("failed", (job, err) => {
  console.error(`Leg job ${job?.id} failed:`, err);
});

console.log(
  `scraper-worker listening on queue "${SEARCH_LEG_QUEUE}" (concurrency=${env.concurrency})`,
);
