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

  // Jittered pacing so a region search doesn't hit delta.com in a burst.
  await sleep(Math.random() * env.jitterMs);
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
      await copyResultsToLeg(cached.legId, legId);
    } else {
      const flights = await runDeltaSearch({
        origin,
        destination: destinationAirport,
        date: searchDate,
        cabin,
        nonstopOnly,
      });
      await insertFlightResults(legId, origin, destinationAirport, cabin, flights);
    }

    await markLegStatus(legId, "done");
  } catch (err) {
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
