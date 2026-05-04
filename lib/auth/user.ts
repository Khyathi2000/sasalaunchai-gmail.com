// User context helpers that depend on Clerk. Server-only.
//
// Test code should import from `./user-test-helpers.js` instead — that file
// has no Clerk dependency and is safe to use in vitest.

import { auth, currentUser } from "@clerk/nextjs/server";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";

export class NotAuthenticatedError extends Error {
  constructor() {
    super("not authenticated");
    this.name = "NotAuthenticatedError";
  }
}

export async function currentUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId ?? null;
}

export async function requireUserId(): Promise<string> {
  const id = await currentUserId();
  if (!id) throw new NotAuthenticatedError();
  return id;
}

/**
 * Make sure a row exists in `users` for the current Clerk user. Returns
 * the userId. Safe to call repeatedly.
 */
export async function ensureUser(): Promise<string> {
  const id = await requireUserId();
  let email: string | undefined;
  try {
    const u = await currentUser();
    email = u?.primaryEmailAddress?.emailAddress ?? undefined;
  } catch {
    // currentUser() can fail in some contexts; not load-bearing.
  }
  await db()
    .insert(users)
    .values({ id, email })
    .onConflictDoUpdate({
      target: users.id,
      set: { email, updatedAt: sql`now()` },
    });
  return id;
}
