// Drizzle database client.
//
// Three modes:
//   - Production / Cloud Run / docker Postgres: postgres-js driver against
//     `DATABASE_URL`.
//   - Tests: in-memory PGlite (set `DATABASE_DRIVER=pglite`). PGlite ships
//     a real Postgres implementation compiled to WASM — no docker.
//   - Local dev fallback: when `DATABASE_URL` is unset and `NODE_ENV` is
//     not `production`, we automatically spin up a PGlite instance with
//     filesystem persistence at `LAUNCH_DEV_DB_DIR` (defaults to
//     `.launch-data/pg`). This makes `npm run dev` work with zero setup.
//
// Initialization is async because PGlite needs to be awaited. We expose
// `initDb()` for the Next.js `instrumentation.ts` hook to call once at
// server start. Route handlers then call the synchronous `db()` getter.

// Node-only imports are deferred to runtime so the Edge bundle (which
// tries to walk imports of instrumentation.ts) doesn't choke on `fs`.
import * as schema from "./schema.js";
import type { drizzle as drizzlePgType } from "drizzle-orm/postgres-js";

export type DB = ReturnType<typeof drizzlePgType<typeof schema>>;

// Stash the singleton on globalThis so Next.js HMR module reloads re-use
// the same DB connection instead of opening a fresh PGlite/Postgres
// client per reload.
interface DbGlobal {
  db: DB | null;
  closeFn: (() => Promise<void>) | null;
  initPromise: Promise<DB> | null;
  mode: "postgres-js" | "pglite-file" | "pglite-memory" | null;
}
const globalForDb = globalThis as unknown as { __launchDb?: DbGlobal };
const G: DbGlobal = (globalForDb.__launchDb ??= {
  db: null,
  closeFn: null,
  initPromise: null,
  mode: null,
});

export function dbMode(): typeof G.mode {
  return G.mode;
}

/**
 * Synchronous getter. Returns the cached client if it exists. Throws
 * with a clear setup message otherwise.
 *
 * Call `initDb()` once at startup (either from Next.js's
 * instrumentation.ts or test setup) before reaching this.
 */
export function db(): DB {
  if (G.db) return G.db;
  throw new Error(
    [
      "Database not initialized.",
      "",
      "Cause: instrumentation.ts didn't run, OR the env didn't match an",
      "init mode. Recover by setting one of:",
      "",
      "  - DATABASE_URL=postgres://user:pass@host:5432/db   (production / docker)",
      "  - (no env)                                          (auto file-backed PGlite in dev)",
      "  - DATABASE_DRIVER=pglite                            (in-memory, tests only)",
      "",
      "If you're already in dev and seeing this, check the server logs for the",
      "init error — the most common cause is a permissions issue on the",
      "LAUNCH_DEV_DB_DIR path (default: .launch-data/pg).",
    ].join("\n"),
  );
}

/**
 * Initialize the database client. Idempotent — safe to call multiple
 * times. Returns the client. Use this from `instrumentation.ts` or test
 * setup.
 */
export async function initDb(): Promise<DB> {
  if (G.db) return G.db;
  if (G.initPromise) return G.initPromise;

  const explicitDriver = process.env.DATABASE_DRIVER;
  const url = process.env.DATABASE_URL;
  const isProd = process.env.NODE_ENV === "production";

  G.initPromise = (async (): Promise<DB> => {
    if (explicitDriver === "pglite") {
      return initPgliteMemory();
    }
    if (url) {
      return initPostgres(url);
    }
    if (isProd) {
      throw new Error(
        "DATABASE_URL is required in production. Set it to your Postgres connection string.",
      );
    }
    // Dev fallback — file-backed PGlite, no setup required.
    return initPgliteFile();
  })();

  return G.initPromise;
}

async function initPostgres(url: string): Promise<DB> {
  // webpackIgnore keeps the edge bundle from trying to walk these
  // Node-only imports. They're resolved at runtime by Node's require.
  const { default: postgres } = await import(/* webpackIgnore: true */ "postgres");
  const { drizzle: drizzlePg } = await import(/* webpackIgnore: true */ "drizzle-orm/postgres-js");
  const client = postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? "10"),
    idle_timeout: 30,
    prepare: false,
  });
  G.closeFn = async () => {
    await client.end({ timeout: 5 });
  };
  G.db = drizzlePg(client, { schema });
  G.mode = "postgres-js";
  return G.db;
}

async function initPgliteFile(): Promise<DB> {
  const { mkdirSync } = await import(/* webpackIgnore: true */ "fs");
  const { resolve } = await import(/* webpackIgnore: true */ "path");
  const dir = resolve(process.cwd(), process.env.LAUNCH_DEV_DB_DIR ?? ".launch-data/pg");
  mkdirSync(dir, { recursive: true });
  // eslint-disable-next-line no-console
  console.log(`[db] DATABASE_URL not set — using file-backed PGlite at ${dir}`);
  const { PGlite } = await import(/* webpackIgnore: true */ "@electric-sql/pglite");
  const { drizzle: drizzlePglite } = await import(/* webpackIgnore: true */ "drizzle-orm/pglite");
  const client = new PGlite(dir);
  G.closeFn = async () => {
    await client.close();
  };
  G.db = drizzlePglite(client as never, { schema }) as unknown as DB;
  G.mode = "pglite-file";
  await ensureBootstrapped(client);
  return G.db;
}

async function initPgliteMemory(): Promise<DB> {
  const { PGlite } = await import(/* webpackIgnore: true */ "@electric-sql/pglite");
  const { drizzle: drizzlePglite } = await import(/* webpackIgnore: true */ "drizzle-orm/pglite");
  const client = new PGlite();
  G.closeFn = async () => {
    await client.close();
  };
  G.db = drizzlePglite(client as never, { schema }) as unknown as DB;
  G.mode = "pglite-memory";
  await client.exec(BOOTSTRAP_SQL);
  return G.db;
}

interface PgliteLike {
  exec(sql: string): Promise<unknown>;
  query<T = unknown>(sql: string): Promise<{ rows: T[] }>;
}

/**
 * Apply the schema only when the DB is fresh. Lets the file-backed PGlite
 * survive restarts without re-running the bootstrap (which would error on
 * already-existing tables).
 */
async function ensureBootstrapped(client: PgliteLike): Promise<void> {
  const result = await client.query<{ exists: boolean }>(
    "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users') AS exists",
  );
  const alreadyBootstrapped = result.rows[0]?.exists === true;
  if (alreadyBootstrapped) return;
  await client.exec(BOOTSTRAP_SQL);
  // eslint-disable-next-line no-console
  console.log("[db] applied bootstrap schema to fresh PGlite store");
}

/**
 * Test-only: PGlite in-memory bootstrap helper. Kept for the existing
 * vitest setup that calls `await ensurePgliteReady()` in beforeAll.
 */
export async function ensurePgliteReady(): Promise<void> {
  if (G.db) return;
  process.env.DATABASE_DRIVER = "pglite";
  await initDb();
}

export async function closeDb(): Promise<void> {
  if (G.closeFn) {
    await G.closeFn();
    G.closeFn = null;
    G.db = null;
    G.initPromise = null;
    G.mode = null;
  }
}

// SQL mirror of the Drizzle schema. Used to bootstrap PGlite (both file
// and memory modes); production Postgres uses drizzle-kit migrations.
const BOOTSTRAP_SQL = `
DO $$ BEGIN
  CREATE TYPE cloud_provider AS ENUM ('aws', 'gcp');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE run_status AS ENUM ('pending', 'running', 'succeeded', 'failed', 'destroyed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider cloud_provider NOT NULL,
  label text NOT NULL DEFAULT 'default',
  ciphertext bytea NOT NULL,
  wrapped_dek bytea NOT NULL,
  kms_key_ref text NOT NULL,
  aws_account_id text,
  aws_region text,
  gcp_project_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS credentials_user_provider_label_idx
  ON credentials(user_id, provider, label);

CREATE TABLE IF NOT EXISTS sessions (
  sid text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source text,
  codebase jsonb,
  analysis jsonb,
  recommendations jsonb,
  plan jsonb,
  plan_id text,
  chat_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  architect_mutations jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL REFERENCES sessions(sid) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider cloud_provider NOT NULL,
  region text NOT NULL,
  status run_status NOT NULL DEFAULT 'pending',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  error_message text,
  selected_services jsonb NOT NULL DEFAULT '[]'::jsonb,
  cost_estimate jsonb
);
CREATE INDEX IF NOT EXISTS runs_user_idx ON runs(user_id);
CREATE INDEX IF NOT EXISTS runs_session_idx ON runs(session_id);
`;

export { schema };
