import type { DeploymentPlan, AnalysisResult, ParsedCodebase } from "../../types/index.js";
import { StepResult } from "../../types/plan.js";
import { runParserAgent } from "../../analysis/parser-agent.js";
import { runAnalyzerAgent } from "../../analysis/analyzer-agent.js";
import { scanForSecurityIssues } from "../../analysis/security-scanner.js";
import { statusPanel, panel, success, error, warn, info, dim, divider } from "../screen.js";
import { createSpinner } from "../spinner.js";
import chalk from "chalk";

export let lastParsedCodebase: ParsedCodebase | undefined;
export let lastAnalysisResult: AnalysisResult | undefined;

export async function stepAnalyze(plan: DeploymentPlan): Promise<StepResult> {
  // Phase 1: Parse codebase
  const parseSpinner = createSpinner("Scanning codebase...").start();
  try {
    lastParsedCodebase = await runParserAgent(plan.source, (msg) => {
      parseSpinner.text = msg;
    });
    parseSpinner.succeed(`Parsed ${lastParsedCodebase.files.length} files`);
  } catch (err) {
    parseSpinner.fail("Failed to parse codebase");
    error(err instanceof Error ? err.message : String(err));
    return StepResult.Retry;
  }

  // Display repo info panel
  const langs = new Map<string, number>();
  for (const f of lastParsedCodebase.files) {
    langs.set(f.language, (langs.get(f.language) || 0) + 1);
  }

  statusPanel("Repository", [
    { label: "Name", value: lastParsedCodebase.repoName },
    { label: "Total Files", value: String(lastParsedCodebase.totalFiles) },
    { label: "Parsed", value: String(lastParsedCodebase.files.length) },
    { label: "Tech Stack", value: lastParsedCodebase.techStack.join(", ") || "None detected", color: chalk.cyan },
    { label: "Languages", value: [...langs.entries()].map(([l, c]) => `${l}(${c})`).join(", ") },
  ]);

  // Phase 1.5: Security scan
  console.log();
  const fileMap = new Map(lastParsedCodebase.files.map(f => [f.path, f.content]));
  const issues = scanForSecurityIssues(fileMap);
  if (issues.length > 0) {
    warn(`${issues.length} security issue(s) found`);
    for (const issue of issues.slice(0, 3)) {
      dim(`[${issue.severity.toUpperCase()}] ${issue.title} in ${issue.file}:${issue.line || "?"}`);
    }
    if (issues.length > 3) dim(`... and ${issues.length - 3} more`);
  } else {
    success("No security issues found");
  }

  // Phase 2: Claude analysis
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log();
    warn("ANTHROPIC_API_KEY not set — skipping AI analysis");
    info("Set it in .env for deep analysis + infrastructure inference");
    return StepResult.Continue;
  }

  console.log();
  const analyzeSpinner = createSpinner("Analyzing with Claude...").start();
  try {
    let chunks = 0;
    lastAnalysisResult = await runAnalyzerAgent(lastParsedCodebase, () => {
      chunks++;
      if (chunks % 20 === 0) analyzeSpinner.text = `Analyzing... ${chunks} chunks streamed`;
    });
    analyzeSpinner.succeed(`Analysis complete — ${lastAnalysisResult.fileExplanations.length} files analyzed`);
  } catch (err) {
    analyzeSpinner.fail("Claude analysis failed");
    warn(err instanceof Error ? err.message : String(err));
    info("Continuing with rule-based inference...");
    return StepResult.Continue;
  }

  // Display analysis results
  if (lastAnalysisResult) {
    console.log();
    statusPanel("AI Analysis", [
      { label: "Files", value: `${lastAnalysisResult.fileExplanations.length} analyzed` },
      { label: "Technologies", value: `${lastAnalysisResult.techConsiderations.length} identified` },
      { label: "Flowchart", value: lastAnalysisResult.flowchart ? `Generated (${lastAnalysisResult.flowchart.split("\n").length} lines)` : "None", color: chalk.green },
    ]);

    if (lastAnalysisResult.infraRequirements) {
      const infra = lastAnalysisResult.infraRequirements;
      const items: { label: string; value: string; color?: (s: string) => string }[] = [
        { label: "Runtime", value: `${infra.runtime.type} — ${infra.runtime.reason.slice(0, 50)}`, color: chalk.yellow },
      ];
      if (infra.databases.length > 0) {
        items.push({ label: "Database", value: infra.databases.map(d => `${d.engine} (${d.type})`).join(", "), color: chalk.blue });
      }
      if (infra.networking.needsLoadBalancer) items.push({ label: "Load Balancer", value: "Required", color: chalk.cyan });
      if (infra.networking.needsCDN) items.push({ label: "CDN", value: "Required", color: chalk.cyan });
      if (infra.auth.type !== "none") items.push({ label: "Auth", value: `${infra.auth.type} via ${infra.auth.provider}` });
      if (infra.envVars.length > 0) {
        const sensitive = infra.envVars.filter(v => v.sensitive).length;
        items.push({ label: "Env Vars", value: `${infra.envVars.length} detected (${sensitive} sensitive)`, color: sensitive > 0 ? chalk.red : chalk.white });
      }

      console.log();
      statusPanel("Infrastructure Requirements", items);
      plan.infraRequirements = infra;
    }
  }

  return StepResult.Continue;
}
