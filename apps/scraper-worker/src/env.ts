export const env = {
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgres://points_search:points_search@localhost:5432/points_search",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  concurrency: Number(process.env.SCRAPE_CONCURRENCY ?? 3),
  headless: process.env.SCRAPE_HEADLESS !== "false",
  /** Override for environments (e.g. custom Docker images) with a pinned Chromium binary. */
  chromiumExecutablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  /** Random delay added before each job starts, to avoid bursty traffic. */
  jitterMs: Number(process.env.SCRAPE_JITTER_MS ?? 4000),
  /** How long a completed leg's results are considered fresh enough to skip re-scraping. */
  cacheTtlMinutes: Number(process.env.SCRAPE_CACHE_TTL_MINUTES ?? 15),
};
