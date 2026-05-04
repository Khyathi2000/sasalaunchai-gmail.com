// Drizzle database client.
//
// Two execution modes:
//   - Production / Cloud Run / local Postgres: postgres-js driver against
//     `DATABASE_URL`.
//   - Tests: in-memory PGlite (set `DATABASE_DRIVER=pglite`). PGlite ships
//     a real Postgres implementation compiled to WASM — no docker required.

import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type DB = ReturnType<typeof drizzlePg<typeof schema>>;

let _db: DB | null = null;
let _closeFn: (() => Promise<void>) | null = null;

export function db(): DB {
  if (_db) return _db;
  const driver = process.env.DATABASE_DRIVER ?? "postgres-js";
  if (driver === "pglite") {
    // Lazy import so production bundles don't pull in PGlite.
    return initPglite();
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      [
        "DATABASE_URL is not set.",
        "",
        "Local dev — fastest path:",
        "  docker compose up -d         # starts Postgres on :5432",
        "  cp .env.local.example .env.local",
        "  npm run db:migrate           # applies the Drizzle schema",
        "  npm run dev",
        "",
        "Production: set DATABASE_URL to your Cloud SQL connection string. See STATUS.md.",
      ].join("\n"),
    );
  }
  const client = postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? "10"),
    idle_timeout: 30,
    prepare: false, // Cloud SQL pgbouncer doesn't speak prepared statements
  });
  _closeFn = async () => {
    await client.end({ timeout: 5 });
  };
  _db = drizzlePg(client, { schema });
  return _db;
}

function initPglite(): DB {
  // Synchronous-ish lazy init for pglite. We do the dynamic import in a way
  // that resolves before first query — callers `await ensurePgliteReady()` in
  // test setup.
  if (!_db) {
    throw new Error(
      "PGlite mode requires `await ensurePgliteReady()` to be called once at test setup.",
    );
  }
  return _db;
}

let _pgliteReadyPromise: Promise<void> | null = null;

export async function ensurePgliteReady(): Promise<void> {
  if (_pgliteReadyPromise) return _pgliteReadyPromise;
  _pgliteReadyPromise = (async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
    const client = new PGlite();
    _closeFn = async () => {
      await client.close();
    };
    _db = drizzlePglite(client as never, { schema }) as unknown as DB;

    // Apply the SQL schema directly — drizzle-kit migrations target real
    // Postgres binaries and aren't worth wiring up for the in-memory test DB.
    await client.exec(BOOTSTRAP_SQL);
  })();
  return _pgliteReadyPromise;
}

export async function closeDb(): Promise<void> {
  if (_closeFn) {
    await _closeFn();
    _closeFn = null;
    _db = null;
    _pgliteReadyPromise = null;
  }
}

// SQL mirror of the Drizzle schema for PGlite test bootstrapping. Keeps
// tests fast by skipping the drizzle-kit migration runner.
const BOOTSTRAP_SQL = `
CREATE TYPE cloud_provider AS ENUM ('aws', 'gcp');
CREATE TYPE run_status AS ENUM ('pending', 'running', 'succeeded', 'failed', 'destroyed');

CREATE TABLE users (
  id text PRIMARY KEY,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE credentials (
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
CREATE UNIQUE INDEX credentials_user_provider_label_idx ON credentials(user_id, provider, label);

CREATE TABLE sessions (
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
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE runs (
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
CREATE INDEX runs_user_idx ON runs(user_id);
CREATE INDEX runs_session_idx ON runs(session_id);
`;

export { schema };
