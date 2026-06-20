// Clerk-free helpers used by tests and admin scripts to seed the `users`
// table. Production code should use `./user.ts` instead.

import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";

export async function ensureUserById(id: string, email?: string): Promise<void> {
  await db().insert(users).values({ id, email }).onConflictDoNothing();
}

export async function getUser(id: string) {
  const rows = await db().select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}
