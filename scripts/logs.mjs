#!/usr/bin/env node
// Tail Cloud Run logs without remembering the gcloud incantation.
//
// Usage:
//   npm run logs                       # last 50 entries from past hour
//   npm run logs -- --follow           # stream new entries every 2s
//   npm run logs -- --errors           # severity >= ERROR only
//   npm run logs -- --since 10m        # time window (10s, 5m, 2h, 1d)
//   npm run logs -- --limit 200
//   SERVICE=other-svc npm run logs

import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => {
  const i = args.indexOf(f);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const SERVICE = process.env.SERVICE || "sasa-web";
const PROJECT_ID = process.env.PROJECT_ID; // optional; gcloud uses default if unset
const follow = has("--follow") || has("-f");
const errorsOnly = has("--errors");
const since = val("--since", "1h");
const limit = parseInt(val("--limit", "50"), 10);

// Parse "10m" / "2h" / "30s" / "1d" → seconds
function durationToSeconds(s) {
  const m = /^(\d+)([smhd])$/.exec(s);
  if (!m) throw new Error(`bad --since: ${s} (use 30s, 10m, 2h, 1d)`);
  const n = parseInt(m[1], 10);
  return n * { s: 1, m: 60, h: 3600, d: 86400 }[m[2]];
}

const COLOR = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};
const sevColor = (sev) => {
  if (sev === "ERROR" || sev === "CRITICAL" || sev === "ALERT" || sev === "EMERGENCY") return COLOR.red;
  if (sev === "WARNING") return COLOR.yellow;
  if (sev === "INFO" || sev === "NOTICE") return COLOR.cyan;
  return COLOR.gray;
};

function buildFilter({ freshnessSeconds, afterTimestamp }) {
  const parts = [
    `resource.type=cloud_run_revision`,
    `resource.labels.service_name=${SERVICE}`,
  ];
  if (errorsOnly) parts.push(`severity>=ERROR`);
  if (afterTimestamp) {
    parts.push(`timestamp>"${afterTimestamp}"`);
  } else if (freshnessSeconds) {
    const since = new Date(Date.now() - freshnessSeconds * 1000).toISOString();
    parts.push(`timestamp>="${since}"`);
  }
  return parts.join(" AND ");
}

function gcloudArgs(filter, lim) {
  const a = [
    "logging", "read", filter,
    `--limit=${lim}`,
    "--format=json",
    "--order=asc",
  ];
  if (PROJECT_ID) a.push(`--project=${PROJECT_ID}`);
  return a;
}

function runGcloud(a) {
  return new Promise((resolve, reject) => {
    const child = spawn("gcloud", a, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(err.trim() || `gcloud exited ${code}`));
      resolve(out);
    });
  });
}

function extractMessage(entry) {
  if (typeof entry.textPayload === "string") return entry.textPayload;
  if (entry.jsonPayload) {
    if (typeof entry.jsonPayload.message === "string") return entry.jsonPayload.message;
    return JSON.stringify(entry.jsonPayload);
  }
  if (entry.protoPayload) {
    return entry.protoPayload.status?.message || JSON.stringify(entry.protoPayload).slice(0, 200);
  }
  return "";
}

function printEntry(e) {
  const ts = (e.timestamp || "").replace("T", " ").replace(/\.\d+Z$/, "Z");
  const sev = (e.severity || "DEFAULT").padEnd(7);
  const rev = e.resource?.labels?.revision_name?.replace(`${SERVICE}-`, "") || "";
  const msg = extractMessage(e).split("\n")[0]; // first line only — keep it scannable
  const c = sevColor(e.severity);
  console.log(
    `${COLOR.dim}${ts}${COLOR.reset} ${c}${sev}${COLOR.reset} ${COLOR.gray}${rev}${COLOR.reset} ${msg}`
  );
}

async function fetchOnce(opts) {
  const filter = buildFilter(opts);
  const out = await runGcloud(gcloudArgs(filter, opts.limit ?? limit));
  if (!out.trim()) return [];
  return JSON.parse(out);
}

async function main() {
  // Initial backfill
  const initial = await fetchOnce({ freshnessSeconds: durationToSeconds(since), limit });
  for (const e of initial) printEntry(e);

  if (!follow) return;

  // Poll loop
  let lastTs = initial.length ? initial[initial.length - 1].timestamp
                              : new Date(Date.now() - 5000).toISOString();
  console.log(`${COLOR.dim}— following (Ctrl-C to stop) —${COLOR.reset}`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await new Promise((r) => setTimeout(r, 2000));
    let entries;
    try {
      entries = await fetchOnce({ afterTimestamp: lastTs, limit: 500 });
    } catch (e) {
      console.error(`${COLOR.red}poll error:${COLOR.reset} ${e.message}`);
      continue;
    }
    for (const e of entries) {
      printEntry(e);
      lastTs = e.timestamp;
    }
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
