#!/usr/bin/env node
// One-command Cloud Run deploy via Cloud Build.
//
// Usage:
//   npm run deploy                  # uses cloudbuild.yaml
//   npm run deploy -- --cheap       # uses cloudbuild.cheap.yaml (scale-to-zero)
//   npm run deploy -- --skip-checks # skip typecheck + dirty-tree warning
//   npm run deploy -- --no-stream   # don't stream build logs
//   CONFIG=cloudbuild.foo.yaml npm run deploy

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import readline from "node:readline";

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => {
  const i = args.indexOf(f);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const CONFIG = process.env.CONFIG || (has("--cheap") ? "cloudbuild.cheap.yaml" : "cloudbuild.yaml");
const SERVICE = process.env.SERVICE || "sasa-web";
const REGION = process.env.REGION || "us-central1";
const PROJECT_ID = process.env.PROJECT_ID; // optional; gcloud uses default if unset
const skipChecks = has("--skip-checks");
const noStream = has("--no-stream");

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m",
};

function die(msg) { console.error(`${C.red}✗${C.reset} ${msg}`); process.exit(1); }
function info(msg) { console.log(`${C.cyan}→${C.reset} ${msg}`); }
function ok(msg) { console.log(`${C.green}✓${C.reset} ${msg}`); }

function sh(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: "utf8", ...opts });
}

async function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(q, (a) => { rl.close(); res(a.trim()); }));
}

// ---- pre-flight ----

if (!fs.existsSync(CONFIG)) die(`config not found: ${CONFIG}`);

if (!skipChecks) {
  // Dirty tree?
  const status = sh("git", ["status", "--porcelain"]);
  if (status.status === 0 && status.stdout.trim()) {
    console.log(`${C.yellow}⚠${C.reset}  uncommitted changes detected:`);
    console.log(status.stdout.split("\n").slice(0, 10).map((l) => `   ${l}`).join("\n"));
    const a = await ask(`${C.yellow}deploy anyway? [y/N] ${C.reset}`);
    if (!/^y(es)?$/i.test(a)) die("aborted");
  }

  // Typecheck
  info("running typecheck...");
  const tc = sh("npm", ["run", "typecheck"], { stdio: ["ignore", "pipe", "pipe"] });
  if (tc.status !== 0) {
    console.error(tc.stdout);
    console.error(tc.stderr);
    die("typecheck failed — fix errors or pass --skip-checks");
  }
  ok("typecheck passed");
}

// Capture previous revision for diff
let prevRev = "";
{
  const a = ["run", "revisions", "list",
    `--service=${SERVICE}`, `--region=${REGION}`,
    "--limit=1", "--format=value(metadata.name)"];
  if (PROJECT_ID) a.push(`--project=${PROJECT_ID}`);
  const r = sh("gcloud", a);
  if (r.status === 0) prevRev = r.stdout.trim();
}

// ---- build ----

info(`submitting build (${CONFIG})...`);
const buildArgs = ["builds", "submit", `--config=${CONFIG}`, "."];
if (PROJECT_ID) buildArgs.push(`--project=${PROJECT_ID}`);
if (noStream) buildArgs.push("--async");

const t0 = Date.now();
const code = await new Promise((res) => {
  const p = spawn("gcloud", buildArgs, { stdio: "inherit" });
  p.on("close", res);
});
if (code !== 0) die(`build failed (gcloud exited ${code})`);

const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
ok(`build complete in ${elapsed}s`);

// ---- post-deploy summary ----

const descArgs = ["run", "services", "describe", SERVICE,
  `--region=${REGION}`,
  "--format=value(status.url,status.latestReadyRevisionName)"];
if (PROJECT_ID) descArgs.push(`--project=${PROJECT_ID}`);
const desc = sh("gcloud", descArgs);
if (desc.status === 0) {
  const [url, newRev] = desc.stdout.trim().split("\t");
  console.log("");
  console.log(`${C.bold}URL:${C.reset}      ${url}`);
  console.log(`${C.bold}Revision:${C.reset} ${prevRev ? `${C.dim}${prevRev}${C.reset} → ` : ""}${C.green}${newRev}${C.reset}`);
  if (prevRev && prevRev !== newRev) {
    const log = sh("git", ["log", "--oneline", "-5"]);
    if (log.status === 0) {
      console.log(`${C.bold}Recent commits:${C.reset}`);
      console.log(log.stdout.split("\n").slice(0, 5).map((l) => `  ${l}`).join("\n"));
    }
  }
  console.log("");
  console.log(`${C.dim}tail logs:  npm run logs -- --follow${C.reset}`);
}
