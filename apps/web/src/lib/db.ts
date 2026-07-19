import pg from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: pg.Pool | undefined;
}

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://points_search:points_search@localhost:5432/points_search";

// Reuse the pool across hot-reloads in dev instead of leaking connections.
export const pool = globalThis.__pgPool ?? new pg.Pool({ connectionString });
if (process.env.NODE_ENV !== "production") {
  globalThis.__pgPool = pool;
}
