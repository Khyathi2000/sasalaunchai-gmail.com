// Session-side persistence for web sessions.
//
// State (codebase, analysis, recommendations, plan, planId) is stored in
// Firestore so it survives Cloud Run revision swaps and is visible across
// instances. Filesystem dirs are still provided for transient terraform
// working artifacts (per-instance, ephemeral by design).

import { mkdirSync } from "fs";
import { join } from "path";
import type {
  ParsedCodebase,
  AnalysisResult,
  ServiceRecommendation,
  DeploymentPlan,
} from "./core.js";
import { firestore } from "./firestore.js";

const ROOT_WORKDIR = process.env.LAUNCH_WEB_WORKDIR || "/tmp/launch-web";
const COLLECTION = "sessions";

export interface SessionRecord {
  sid: string;
  createdAt: string;
  updatedAt: string;
  source?: string;
  codebase?: ParsedCodebase;
  analysis?: AnalysisResult;
  recommendations?: ServiceRecommendation[];
  plan?: DeploymentPlan;
  planId?: string;
}

function workDir(sid: string): string {
  return join(ROOT_WORKDIR, sid);
}

// Returns a transient per-instance working directory for terraform artifacts.
// Not used for session state — that lives in Firestore.
export function ensureSessionDir(sid: string): string {
  const dir = workDir(sid);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export async function readSession(sid: string): Promise<SessionRecord | null> {
  const snap = await firestore().collection(COLLECTION).doc(sid).get();
  if (!snap.exists) return null;
  return snap.data() as SessionRecord;
}

export async function writeSession(record: SessionRecord): Promise<void> {
  record.updatedAt = new Date().toISOString();
  await firestore().collection(COLLECTION).doc(record.sid).set(record);
}

export async function updateSession(
  sid: string,
  update: (r: SessionRecord) => SessionRecord,
): Promise<SessionRecord> {
  const existing =
    (await readSession(sid)) ?? {
      sid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  const next = update(existing);
  await writeSession(next);
  return next;
}

export function newSessionId(): string {
  return `sid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
