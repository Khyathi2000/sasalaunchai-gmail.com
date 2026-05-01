import type { ParsedCodebase } from "../../types/index.js";
import type { ServiceRecommendation } from "../../types/cloud.js";

export function inferApiServices(codebase: ParsedCodebase, provider: string): ServiceRecommendation[] {
  const recs: ServiceRecommendation[] = [];
  const deps = getDeps(codebase);
  const fileContents = codebase.files.map((f) => f.content ?? "").join("\n");

  // Server framework detection — strong signal that the app exposes HTTP routes
  const hasExpress = deps.has("express");
  const hasFastify = deps.has("fastify");
  const hasHono = deps.has("hono");
  const hasKoa = deps.has("koa");
  const hasNestjs = deps.has("@nestjs/core");
  const hasFlask = fileContents.includes("from flask import");
  const hasFastApi = fileContents.includes("from fastapi import");
  const hasGin = fileContents.includes("github.com/gin-gonic/gin");
  const hasServerless = codebase.files.some((f) => f.path.includes("serverless.yml") || f.path.includes("serverless.ts"));

  const isApiServer = hasExpress || hasFastify || hasHono || hasKoa || hasNestjs || hasFlask || hasFastApi || hasGin;

  // Lambda + API Gateway is the cheap/serverless route
  const wantsServerless = hasServerless || (isApiServer && !codebase.files.some((f) => /[Dd]ockerfile/.test(f.path)));

  if (provider === "aws" && (isApiServer || wantsServerless)) {
    recs.push({
      serviceId: "api-gateway",
      serviceName: "API Gateway (HTTP API)",
      category: "api",
      provider: "aws",
      reason: detectionReason(deps, fileContents),
      confidence: isApiServer ? "high" : "medium",
      config: {},
      dependsOn: wantsServerless ? ["lambda"] : [],
    });
  }
  // GCP equivalent is Cloud Run + a Cloud Endpoint or load balancer; we skip a
  // dedicated agent here since cloud-run already exposes a public URL.

  return recs;
}

function detectionReason(deps: Set<string>, contents: string): string {
  if (deps.has("express")) return "Express.js routes detected";
  if (deps.has("fastify")) return "Fastify routes detected";
  if (deps.has("hono")) return "Hono routes detected";
  if (deps.has("@nestjs/core")) return "NestJS HTTP controllers detected";
  if (deps.has("koa")) return "Koa routes detected";
  if (contents.includes("from fastapi import")) return "FastAPI routes detected";
  if (contents.includes("from flask import")) return "Flask routes detected";
  if (contents.includes("gin-gonic/gin")) return "Gin (Go) routes detected";
  return "HTTP API patterns detected";
}

function getDeps(codebase: ParsedCodebase): Set<string> {
  const out = new Set<string>();
  if (codebase.packageJson) {
    const d = codebase.packageJson.dependencies as Record<string, string> | undefined;
    const dd = codebase.packageJson.devDependencies as Record<string, string> | undefined;
    if (d) Object.keys(d).forEach((k) => out.add(k));
    if (dd) Object.keys(dd).forEach((k) => out.add(k));
  }
  return out;
}
