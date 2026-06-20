import Anthropic from "@anthropic-ai/sdk";
import type { ParsedCodebase, AnalysisResult, FileExplanation, TechConsideration, InfraRequirements } from "../types/index";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}
const MAX_CONTENT_CHARS = 120_000;

function buildPrompt(codebase: ParsedCodebase): string {
  const fileList = codebase.files.map((f) => `- ${f.path} (${f.language})`).join("\n");

  const sortedFiles = [...codebase.files].sort((a, b) => a.size - b.size);
  const selectedContent: string[] = [];
  let totalChars = 0;
  for (const file of sortedFiles) {
    if (totalChars + file.content.length > MAX_CONTENT_CHARS) break;
    selectedContent.push(`=== FILE: ${file.path} ===\n${file.content}`);
    totalChars += file.content.length;
  }

  const techList = codebase.techStack.join(", ") || "Unknown";
  const pkgName = codebase.packageJson
    ? (codebase.packageJson.name as string) ?? codebase.repoName
    : codebase.repoName;

  return `You are an expert software architect and cloud infrastructure engineer analyzing a codebase called "${pkgName}" (${codebase.repoName}).

## Repository Overview
- Total files: ${codebase.totalFiles}
- Technologies detected: ${techList}
- Default branch: ${codebase.defaultBranch}

## Full File Tree
${fileList}

## File Contents (top ${selectedContent.length} key files)
${selectedContent.join("\n\n")}

---

Analyze this codebase thoroughly and respond with EXACTLY these four sections in this order.

[FLOWCHART]
Generate a valid Mermaid flowchart (flowchart TD) that shows the high-level architecture. Include main entry points, key modules, data flow, and external services. Use subgraphs. Max 25 nodes.
Output only the raw Mermaid code (starting with "flowchart TD"), no backticks.
[/FLOWCHART]

[FILES]
Output a JSON array where each object has:
- "path": string
- "role": string — one of: "entry-point", "component", "api-route", "utility", "config", "model", "service", "middleware", "test", "style", "documentation", "other"
- "explanation": string — 4-6 sentences covering responsibility, logic, architecture fit, design decisions, impact if removed
- "keyExports": string[] — up to 6 important exports
- "connects": string[] — up to 5 dependencies
- "patterns": string[] — design patterns used
- "complexity": "simple" | "medium" | "complex"

Include ALL files. Order by importance. Output only raw JSON array.
[/FILES]

[TECH]
Output a JSON array where each object has:
- "name": string
- "purpose": string (1 sentence)
- "whyChosen": string (1-2 sentences)
- "alternative": string (optional)

Top 10 technologies. Output only raw JSON array.
[/TECH]

[INFRA]
Analyze this codebase for cloud deployment requirements. Output a single JSON object with:
{
  "runtime": { "type": "container" | "serverless" | "vm", "reason": "..." },
  "databases": [{ "type": "relational" | "document" | "key-value" | "graph", "engine": "postgresql" | "mysql" | "mongodb" | "redis" | "dynamodb" | "none", "reason": "..." }],
  "storage": [{ "type": "object" | "block" | "file" | "none", "reason": "..." }],
  "messaging": [{ "type": "queue" | "pubsub" | "stream" | "none", "reason": "..." }],
  "caching": [{ "type": "redis" | "memcached" | "cdn" | "none", "reason": "..." }],
  "networking": { "needsLoadBalancer": true/false, "needsCDN": true/false, "needsVPN": false, "reason": "..." },
  "auth": { "type": "oauth" | "jwt" | "session" | "none", "provider": "clerk" | "cognito" | "auth0" | "custom" | "none", "reason": "..." },
  "scaling": { "min": 1, "max": 10, "metric": "cpu" | "requests" | "queue-depth", "reason": "..." },
  "envVars": [{ "key": "DATABASE_URL", "description": "...", "sensitive": true }]
}

Be specific based on actual code patterns found. Output only raw JSON object.
[/INFRA]`;
}

function extractSection(text: string, tag: string): string {
  const open = `[${tag}]`;
  const close = `[/${tag}]`;
  const start = text.indexOf(open);
  const end = text.indexOf(close);
  if (start === -1 || end === -1) return "";
  return text.slice(start + open.length, end).trim();
}

function parseJSON<T>(raw: string, fallback: T): T {
  try {
    const cleaned = raw.replace(/^```[a-z]*\n?/gm, "").replace(/```$/gm, "").trim();
    return JSON.parse(cleaned) as T;
  } catch { return fallback; }
}

export type AnalyzerStreamCallback = (chunk: string) => void;

export async function runAnalyzerAgent(
  codebase: ParsedCodebase,
  onStream: AnalyzerStreamCallback
): Promise<AnalysisResult> {
  const prompt = buildPrompt(codebase);
  let fullText = "";

  const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";

  const stream = await getClient().messages.stream({
    model,
    max_tokens: 16000,
    messages: [{ role: "user", content: prompt }],
  });

  try {
    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
        fullText += chunk.delta.text;
        onStream(chunk.delta.text);
      }
    }
  } catch (streamErr) {
    // If we got partial text, try to parse what we have
    if (fullText.length > 100) {
      onStream("\n[Stream interrupted — parsing partial results]");
    } else {
      throw streamErr;
    }
  }

  const flowchart = extractSection(fullText, "FLOWCHART");
  const filesRaw = extractSection(fullText, "FILES");
  const techRaw = extractSection(fullText, "TECH");
  const infraRaw = extractSection(fullText, "INFRA");

  const fileExplanations = parseJSON<FileExplanation[]>(filesRaw, []);
  const techConsiderations = parseJSON<TechConsideration[]>(techRaw, []);
  const infraRequirements = parseJSON<InfraRequirements | undefined>(infraRaw, undefined);

  const firstExplanation = fileExplanations[0]?.explanation ?? "";
  const summary = firstExplanation
    ? `${codebase.repoName} — ${firstExplanation}`
    : `Analysis of ${codebase.repoName} with ${codebase.totalFiles} files and ${codebase.techStack.length} technologies.`;

  return {
    repoName: codebase.repoName, summary, flowchart,
    fileExplanations, techConsiderations, infraRequirements,
    analyzedAt: new Date().toISOString(),
  };
}
