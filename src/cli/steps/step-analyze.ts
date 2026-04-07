import type { DeploymentPlan, AnalysisResult, ParsedCodebase } from "../../types/index.js";
import { StepResult } from "../../types/plan.js";
import { runParserAgent } from "../../analysis/parser-agent.js";
import { runAnalyzerAgent } from "../../analysis/analyzer-agent.js";
import { log } from "../../utils/logger.js";
import { header, keyValue, subheader } from "../renderer.js";
import { createSpinner } from "../spinner.js";

// Store analysis results for later steps
export let lastParsedCodebase: ParsedCodebase | undefined;
export let lastAnalysisResult: AnalysisResult | undefined;

export async function stepAnalyze(plan: DeploymentPlan): Promise<StepResult> {
  header("Code Analysis");

  // Phase 1: Parse codebase
  const parseSpinner = createSpinner("Parsing codebase...").start();
  try {
    lastParsedCodebase = await runParserAgent(plan.source, (msg, count) => {
      parseSpinner.text = msg;
    });
    parseSpinner.succeed(`Parsed ${lastParsedCodebase.files.length} files`);
  } catch (error) {
    parseSpinner.fail("Failed to parse codebase");
    log.error(error instanceof Error ? error.message : String(error));
    return StepResult.Retry;
  }

  // Display parsing results
  subheader("Repository Info");
  keyValue("Name", lastParsedCodebase.repoName);
  keyValue("Total files", String(lastParsedCodebase.totalFiles));
  keyValue("Parsed files", String(lastParsedCodebase.files.length));
  keyValue("Tech stack", lastParsedCodebase.techStack.join(", ") || "None detected");
  console.log();

  // Phase 2: Analyze with Claude
  if (!process.env.ANTHROPIC_API_KEY) {
    log.warn("ANTHROPIC_API_KEY not set. Skipping AI analysis.");
    log.info("Set ANTHROPIC_API_KEY in .env to enable deep analysis and infrastructure inference.");
    return StepResult.Continue;
  }

  const analyzeSpinner = createSpinner("Analyzing with Claude...").start();
  try {
    lastAnalysisResult = await runAnalyzerAgent(lastParsedCodebase, (chunk) => {
      // Stream chunks — update spinner text with progress
      const lines = chunk.split("\n").filter(Boolean);
      if (lines.length > 0) {
        analyzeSpinner.text = `Analyzing... ${lines[lines.length - 1].slice(0, 60)}`;
      }
    });
    analyzeSpinner.succeed("Analysis complete");
  } catch (error) {
    analyzeSpinner.fail("Analysis failed");
    log.error(error instanceof Error ? error.message : String(error));
    log.info("Continuing without AI analysis...");
  }

  // Display analysis results
  if (lastAnalysisResult) {
    subheader("Analysis Summary");
    console.log(`  ${lastAnalysisResult.summary.slice(0, 200)}`);
    console.log();

    if (lastAnalysisResult.techConsiderations.length > 0) {
      subheader("Key Technologies");
      for (const tech of lastAnalysisResult.techConsiderations.slice(0, 5)) {
        keyValue(tech.name, tech.purpose);
      }
    }

    if (lastAnalysisResult.infraRequirements) {
      subheader("Infrastructure Requirements");
      const infra = lastAnalysisResult.infraRequirements;
      keyValue("Runtime", `${infra.runtime.type} — ${infra.runtime.reason}`);
      if (infra.databases.length > 0) {
        keyValue("Database", infra.databases.map(d => `${d.engine} (${d.type})`).join(", "));
      }
      if (infra.networking.needsLoadBalancer) keyValue("Load Balancer", "Required");
      if (infra.networking.needsCDN) keyValue("CDN", "Required");
      if (infra.auth.type !== "none") keyValue("Auth", `${infra.auth.type} via ${infra.auth.provider}`);

      // Store infra requirements in plan
      plan.infraRequirements = infra;
    }
    console.log();
  }

  return StepResult.Continue;
}
