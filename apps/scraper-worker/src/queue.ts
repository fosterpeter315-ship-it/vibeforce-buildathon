import IORedis from "ioredis";
import { SEARCH_LEG_QUEUE } from "@points-search/shared";
import { env } from "./env.js";

export { SEARCH_LEG_QUEUE };

export function createRedisConnection(): IORedis {
  return new IORedis(env.redisUrl, { maxRetriesPerRequest: null });
}
