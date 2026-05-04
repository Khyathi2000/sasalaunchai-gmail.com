// Per-user session persistence backed by Postgres (Drizzle).
//
// Replaces the previous Firestore-only / filesystem-fallback layout.
// Sessions are now scoped to a Clerk userId and live in the `sessions`
// table; the on-disk session JSON files are still produced as transient
// terraform working dirs (per-instance, ephemeral by design).

import { mkdirSync } from "fs";
import { join } from "path";
import { and, desc, eq } from "drizzle-orm";
import type {
  ParsedCodebase,
  AnalysisResult,
  ServiceRecommendation,
  DeploymentPlan,
} from "./core.js";
import { db } from "./db/index.js";
import { sessions, type SessionRow } from "./db/schema.js";

const ROOT_WORKDIR = process.env.LAUNCH_WEB_WORKDIR || "/tmp/launch-web";

export interface ChatMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  ts: string;
}

export interface ArchitectMutation {
  ts: string;
  kind: "add_service" | "remove_service" | "swap_service" | "set_provider" | "set_region";
  before: unknown;
  after: unknown;
  rationale?: string;
}

export interface SessionRecord {
  sid: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  source?: string;
  codebase?: ParsedCodebase;
  analysis?: AnalysisResult;
  recommendations?: ServiceRecommendation[];
  plan?: DeploymentPlan;
  planId?: string;
  chatHistory?: ChatMessage[];
  architectMutations?: ArchitectMutation[];
}

function workDir(sid: string): string {
  return join(ROOT_WORKDIR, sid);
}

/** Returns a transient per-instance working directory for terraform artifacts. */
export function ensureSessionDir(sid: string): string {
  const dir = workDir(sid);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function rowToRecord(row: SessionRow): SessionRecord {
  return {
    sid: row.sid,
    userId: row.userId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    source: row.source ?? undefined,
    codebase: (row.codebase as ParsedCodebase | null) ?? undefined,
    analysis: (row.analysis as AnalysisResult | null) ?? undefined,
    recommendations: (row.recommendations as ServiceRecommendation[] | null) ?? undefined,
    plan: (row.plan as DeploymentPlan | null) ?? undefined,
    planId: row.planId ?? undefined,
    chatHistory: (row.chatHistory as ChatMessage[]) ?? [],
    architectMutations: (row.architectMutations as ArchitectMutation[]) ?? [],
  };
}

/**
 * Read a session by sid. Returns null if it doesn't exist OR if the caller
 * doesn't own it (caller must pass `userId` to enforce isolation).
 *
 * Pass `userId: undefined` ONLY in admin / migration scripts.
 */
export async function readSession(
  sid: string,
  userId?: string,
): Promise<SessionRecord | null> {
  const where = userId
    ? and(eq(sessions.sid, sid), eq(sessions.userId, userId))
    : eq(sessions.sid, sid);
  const rows = await db().select().from(sessions).where(where).limit(1);
  return rows[0] ? rowToRecord(rows[0]) : null;
}

/**
 * Insert or update a session row. The userId on the record is the source
 * of truth — callers must set it before writing.
 */
export async function writeSession(record: SessionRecord): Promise<void> {
  if (!record.userId) {
    throw new Error("writeSession requires record.userId");
  }
  const now = new Date();
  await db()
    .insert(sessions)
    .values({
      sid: record.sid,
      userId: record.userId,
      source: record.source,
      codebase: record.codebase ?? null,
      analysis: record.analysis ?? null,
      recommendations: record.recommendations ?? null,
      plan: record.plan ?? null,
      planId: record.planId,
      chatHistory: record.chatHistory ?? [],
      architectMutations: record.architectMutations ?? [],
      createdAt: new Date(record.createdAt),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: sessions.sid,
      set: {
        source: record.source,
        codebase: record.codebase ?? null,
        analysis: record.analysis ?? null,
        recommendations: record.recommendations ?? null,
        plan: record.plan ?? null,
        planId: record.planId,
        chatHistory: record.chatHistory ?? [],
        architectMutations: record.architectMutations ?? [],
        updatedAt: now,
      },
    });
}

/**
 * Read-modify-write helper. If the session doesn't exist, creates it under
 * the given userId. Throws if the session exists but is owned by someone
 * else — prevents one user from writing into another user's row via the
 * sid (which is exposed in URLs).
 */
export async function updateSession(
  sid: string,
  userId: string,
  update: (r: SessionRecord) => SessionRecord,
): Promise<SessionRecord> {
  // Raw lookup (no user filter) so we can detect cross-user attempts.
  const rawRows = await db().select().from(sessions).where(eq(sessions.sid, sid)).limit(1);
  const existing = rawRows[0] ? rowToRecord(rawRows[0]) : null;
  if (existing && existing.userId !== userId) {
    throw new Error(`session ${sid} is not owned by user ${userId}`);
  }
  const seed: SessionRecord = existing ?? {
    sid,
    userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    chatHistory: [],
    architectMutations: [],
  };
  const next = update(seed);
  next.userId = userId; // never let the updater overwrite ownership
  await writeSession(next);
  return next;
}

/** List the current user's sessions, newest first. */
export async function listUserSessions(userId: string, limit = 50): Promise<SessionRecord[]> {
  const rows = await db()
    .select()
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.updatedAt))
    .limit(limit);
  return rows.map(rowToRecord);
}

export async function deleteSession(sid: string, userId: string): Promise<boolean> {
  const result = await db()
    .delete(sessions)
    .where(and(eq(sessions.sid, sid), eq(sessions.userId, userId)))
    .returning({ sid: sessions.sid });
  return result.length > 0;
}

export function newSessionId(): string {
  return `sid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
