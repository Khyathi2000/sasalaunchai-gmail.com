// One-shot migration: copy Firestore `sessions` documents into the new
// Postgres `sessions` table. Old sessions are anonymous (no userId) so they
// must be claimed by an explicit migration target — pass --owner=<clerkUserId>
// or --skip-orphans to drop them.
//
//   GOOGLE_APPLICATION_CREDENTIALS=... \
//   DATABASE_URL=postgres://... \
//   npx tsx scripts/migrate-firestore-sessions.ts --owner=user_xyz
//
// Idempotent: skips sessions whose `sid` already exists in Postgres.

import { Firestore } from "@google-cloud/firestore";
import { db, ensurePgliteReady } from "../lib/db/index.js";
import { sessions, users } from "../lib/db/schema.js";
import { eq } from "drizzle-orm";

const args = process.argv.slice(2);
const ownerArg = args.find((a) => a.startsWith("--owner="));
const skipOrphans = args.includes("--skip-orphans");
const owner = ownerArg?.slice("--owner=".length);

if (!owner && !skipOrphans) {
  console.error("Usage: tsx scripts/migrate-firestore-sessions.ts --owner=<clerkUserId> | --skip-orphans");
  process.exit(1);
}

async function main() {
  if (process.env.DATABASE_DRIVER === "pglite") {
    await ensurePgliteReady();
  }

  if (owner) {
    // Make sure the target user exists in Postgres so the FK passes.
    await db()
      .insert(users)
      .values({ id: owner })
      .onConflictDoNothing();
  }

  const fs = new Firestore({ ignoreUndefinedProperties: true });
  const snap = await fs.collection("sessions").get();
  console.log(`[migrate] found ${snap.size} Firestore sessions`);

  let copied = 0;
  let skipped = 0;
  for (const doc of snap.docs) {
    const data = doc.data() as {
      sid: string;
      createdAt?: string;
      source?: string;
      codebase?: unknown;
      analysis?: unknown;
      recommendations?: unknown;
      plan?: unknown;
      planId?: string;
    };
    const sid = data.sid ?? doc.id;
    const existing = await db().select().from(sessions).where(eq(sessions.sid, sid)).limit(1);
    if (existing.length > 0) {
      skipped++;
      continue;
    }
    if (!owner) {
      skipped++;
      continue;
    }
    await db().insert(sessions).values({
      sid,
      userId: owner,
      source: data.source ?? null,
      codebase: (data.codebase ?? null) as never,
      analysis: (data.analysis ?? null) as never,
      recommendations: (data.recommendations ?? null) as never,
      plan: (data.plan ?? null) as never,
      planId: data.planId ?? null,
      createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
      updatedAt: new Date(),
    });
    copied++;
  }
  console.log(`[migrate] copied=${copied} skipped=${skipped}`);
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
