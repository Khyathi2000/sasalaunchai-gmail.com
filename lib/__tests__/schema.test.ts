import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../db/index.js";
import { runs, sessions, users, credentials } from "../db/schema.js";
import { ensureUserById } from "../auth/user-test-helpers.js";
import { eq } from "drizzle-orm";

beforeEach(async () => {
  await db().delete(runs);
  await db().delete(sessions);
  await db().delete(credentials);
  await db().delete(users);
});

describe("drizzle schema integrity", () => {
  it("cascades session delete when user is removed", async () => {
    await ensureUserById("u1");
    await db().insert(sessions).values({ sid: "s1", userId: "u1" });
    await db().delete(users).where(eq(users.id, "u1"));
    const found = await db().select().from(sessions).where(eq(sessions.sid, "s1"));
    expect(found).toHaveLength(0);
  });

  it("cascades runs when session is removed", async () => {
    await ensureUserById("u2");
    await db().insert(sessions).values({ sid: "s2", userId: "u2" });
    await db().insert(runs).values({
      sessionId: "s2",
      userId: "u2",
      provider: "aws",
      region: "us-east-1",
    });
    await db().delete(sessions).where(eq(sessions.sid, "s2"));
    const found = await db().select().from(runs).where(eq(runs.sessionId, "s2"));
    expect(found).toHaveLength(0);
  });

  it("rejects credentials with no matching user (FK)", async () => {
    await expect(
      db().insert(credentials).values({
        userId: "ghost",
        provider: "aws",
        ciphertext: Buffer.from("x"),
        wrappedDek: Buffer.from("y"),
        kmsKeyRef: "test",
      }),
    ).rejects.toThrow();
  });

  it("enforces unique (user_id, provider, label)", async () => {
    await ensureUserById("u3");
    await db().insert(credentials).values({
      userId: "u3",
      provider: "aws",
      label: "prod",
      ciphertext: Buffer.from("a"),
      wrappedDek: Buffer.from("b"),
      kmsKeyRef: "test",
    });
    await expect(
      db().insert(credentials).values({
        userId: "u3",
        provider: "aws",
        label: "prod",
        ciphertext: Buffer.from("c"),
        wrappedDek: Buffer.from("d"),
        kmsKeyRef: "test",
      }),
    ).rejects.toThrow();
  });
});
