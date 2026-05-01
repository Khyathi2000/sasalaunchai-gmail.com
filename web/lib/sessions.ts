// Session-side persistence for web sessions. Keeps codebase + analysis +
// recommendations + plan info in `.launch/web/<sid>/`.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type {
  ParsedCodebase,
  AnalysisResult,
  ServiceRecommendation,
  DeploymentPlan,
} from "./core.js";

const ROOT_WORKDIR = process.env.LAUNCH_WEB_WORKDIR || ".launch/web";

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

function sessionDir(sid: string): string {
  return join(process.cwd(), ROOT_WORKDIR, sid);
}

function sessionFile(sid: string): string {
  return join(sessionDir(sid), "session.json");
}

export function ensureSessionDir(sid: string): string {
  const dir = sessionDir(sid);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function readSession(sid: string): SessionRecord | null {
  const file = sessionFile(sid);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as SessionRecord;
  } catch {
    return null;
  }
}

export function writeSession(record: SessionRecord): void {
  ensureSessionDir(record.sid);
  record.updatedAt = new Date().toISOString();
  writeFileSync(sessionFile(record.sid), JSON.stringify(record, null, 2));
}

export function updateSession(
  sid: string,
  update: (r: SessionRecord) => SessionRecord,
): SessionRecord {
  const existing =
    readSession(sid) ?? {
      sid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  const next = update(existing);
  writeSession(next);
  return next;
}

export function newSessionId(): string {
  return `sid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
