// Apply Drizzle migrations against the configured DATABASE_URL.
//
//   DATABASE_URL=postgres://user:pass@host:5432/db npm run db:migrate
//
// Run this from your laptop with Cloud SQL Auth Proxy:
//   ./cloud-sql-proxy --port 5432 PROJECT:REGION:INSTANCE
// or against the local docker-compose Postgres for dev.

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = resolve(here, "..", "lib", "db", "migrations");

  console.log(`[db:migrate] applying migrations from ${migrationsFolder}`);
  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client);
  await migrate(db, { migrationsFolder });
  console.log(`[db:migrate] done`);
  await client.end();
}

main().catch((err) => {
  console.error("[db:migrate] failed:", err);
  process.exit(1);
});
