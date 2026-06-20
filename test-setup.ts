// Global test setup. Forces the in-memory PGlite driver and a known KMS key
// so credential round-trips are deterministic.

import { afterAll, beforeAll } from "vitest";
import { closeDb, ensurePgliteReady } from "./lib/db/index.js";
import { setKmsProvider } from "./lib/kms/index.js";
import { LocalKms } from "./lib/kms/local-kms.js";

process.env.DATABASE_DRIVER = "pglite";
process.env.LAUNCH_KMS_PROVIDER = "local";
// Deterministic 32-byte test key (base64 of 32 bytes of 0xAA).
process.env.LAUNCH_KMS_MASTER_KEY = Buffer.alloc(32, 0xaa).toString("base64");

beforeAll(async () => {
  await ensurePgliteReady();
  setKmsProvider(new LocalKms(Buffer.alloc(32, 0xaa)));
});

afterAll(async () => {
  await closeDb();
});
