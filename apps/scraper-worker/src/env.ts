export const env = {
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgres://points_search:points_search@localhost:5432/points_search",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  // Default to fully serial, unhurried requests. A region search hitting
  // Delta's calendar endpoint with several requests in the same second
  // looks nothing like a real single user browsing, and is a likely trigger
  // for the anti-bot "444 connection closed" responses seen in practice.
  concurrency: Number(process.env.SCRAPE_CONCURRENCY ?? 1),
  headless: process.env.SCRAPE_HEADLESS !== "false",
  /** Override for environments (e.g. custom Docker images) with a pinned Chromium binary. */
  chromiumExecutablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  /** Guaranteed minimum delay before each job starts, on top of jitterMs. */
  minDelayMs: Number(process.env.SCRAPE_MIN_DELAY_MS ?? 4000),
  /** Additional random delay (0..jitterMs) added on top of minDelayMs. */
  jitterMs: Number(process.env.SCRAPE_JITTER_MS ?? 4000),
  /** How long a completed leg's results are considered fresh enough to skip re-scraping. */
  cacheTtlMinutes: Number(process.env.SCRAPE_CACHE_TTL_MINUTES ?? 15),
};
