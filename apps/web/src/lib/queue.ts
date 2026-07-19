import { Queue } from "bullmq";
import IORedis from "ioredis";
import { SEARCH_LEG_QUEUE, type SearchLegJob } from "@points-search/shared";

declare global {
  // eslint-disable-next-line no-var
  var __searchLegQueue: Queue<SearchLegJob> | undefined;
}

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

function createQueue(): Queue<SearchLegJob> {
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  return new Queue<SearchLegJob>(SEARCH_LEG_QUEUE, { connection });
}

export const searchLegQueue = globalThis.__searchLegQueue ?? createQueue();
if (process.env.NODE_ENV !== "production") {
  globalThis.__searchLegQueue = searchLegQueue;
}
