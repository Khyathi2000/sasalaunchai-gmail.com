import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../db/index.js";
import { sessions, users } from "../db/schema.js";
import {
  newSessionId,
  readSession,
  updateSession,
  writeSession,
  listUserSessions,
  deleteSession,
} from "../sessions.js";
import { ensureUserById } from "../auth/user-test-helpers.js";

beforeEach(async () => {
  await db().delete(sessions);
  await db().delete(users);
  await ensureUserById("user_x");
  await ensureUserById("user_y");
});

describe("sessions", () => {
  it("creates a session via updateSession and reads it back", async () => {
    const sid = newSessionId();
    const rec = await updateSession(sid, "user_x", (r) => ({ ...r, source: "github.com/foo/bar" }));
    expect(rec.source).toBe("github.com/foo/bar");
    expect(rec.userId).toBe("user_x");

    const got = await readSession(sid, "user_x");
    expect(got?.source).toBe("github.com/foo/bar");
  });

  it("does not return another user's session", async () => {
    const sid = newSessionId();
    await updateSession(sid, "user_x", (r) => ({ ...r, source: "private" }));

    const asY = await readSession(sid, "user_y");
    expect(asY).toBeNull();
  });

  it("refuses cross-user updates", async () => {
    const sid = newSessionId();
    await updateSession(sid, "user_x", (r) => r);
    await expect(updateSession(sid, "user_y", (r) => r)).rejects.toThrow(/not owned/);
  });

  it("ignores attempts to overwrite ownership in the updater", async () => {
    const sid = newSessionId();
    await updateSession(sid, "user_x", (r) => ({ ...r, userId: "user_y" }));
    const got = await readSession(sid, "user_x");
    expect(got?.userId).toBe("user_x");
  });

  it("listUserSessions returns only the caller's sessions, newest first", async () => {
    await updateSession(newSessionId(), "user_x", (r) => ({ ...r, source: "a" }));
    await new Promise((r) => setTimeout(r, 5));
    await updateSession(newSessionId(), "user_x", (r) => ({ ...r, source: "b" }));
    await updateSession(newSessionId(), "user_y", (r) => ({ ...r, source: "c" }));
    const list = await listUserSessions("user_x");
    expect(list).toHaveLength(2);
    expect(list[0].source).toBe("b");
    expect(list[1].source).toBe("a");
  });

  it("writeSession round-trips JSONB payloads", async () => {
    const sid = newSessionId();
    await writeSession({
      sid,
      userId: "user_x",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // Sample payload similar to what runAnalyzerAgent emits.
      analysis: {
        summary: "hello",
        flowchart: "graph TD; A-->B",
        fileExplanations: [],
        techConsiderations: [],
        infraRequirements: { runtime: "container" } as never,
      } as never,
      chatHistory: [{ role: "user", content: "hi", ts: new Date().toISOString() }],
    });
    const got = await readSession(sid, "user_x");
    expect(got?.analysis?.summary).toBe("hello");
    expect(got?.chatHistory?.[0]?.content).toBe("hi");
  });

  it("deleteSession removes only the caller's session", async () => {
    const sidX = newSessionId();
    const sidY = newSessionId();
    await updateSession(sidX, "user_x", (r) => r);
    await updateSession(sidY, "user_y", (r) => r);
    expect(await deleteSession(sidX, "user_y")).toBe(false); // wrong owner
    expect(await deleteSession(sidX, "user_x")).toBe(true);
    expect(await readSession(sidX, "user_x")).toBeNull();
    expect(await readSession(sidY, "user_y")).not.toBeNull();
  });
});
