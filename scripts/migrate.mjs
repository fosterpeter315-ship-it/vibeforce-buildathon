import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(here, "..", "db", "schema.sql");

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://points_search:points_search@localhost:5432/points_search";

async function main() {
  const sql = await readFile(schemaPath, "utf8");
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query(sql);
    console.log("Migration applied.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
