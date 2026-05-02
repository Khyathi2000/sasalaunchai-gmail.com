import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export async function inferInfrastructure(
  codebaseSummary: string,
  techStack: string[],
  detectedPatterns: string[]
): Promise<string> {
  const message = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: `You are a cloud infrastructure architect. Given this codebase analysis, recommend the optimal AWS/GCP cloud architecture.

Tech Stack: ${techStack.join(", ")}
Detected Patterns: ${detectedPatterns.join(", ")}
Summary: ${codebaseSummary}

Respond with a JSON object containing:
- "provider": "aws" or "gcp" (recommend the best fit)
- "services": [{ "id": "...", "name": "...", "reason": "..." }]
- "architecture": "Brief description of the recommended architecture"
- "estimatedCost": "Rough monthly cost estimate range"

Output only the raw JSON.`,
    }],
  });

  const block = message.content[0];
  return block.type === "text" ? block.text : "{}";
}

export async function refineDeploymentPlan(
  plan: string,
  codebaseContext: string
): Promise<string> {
  const message = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: `Review this deployment plan and suggest improvements:

Plan: ${plan}
Codebase Context: ${codebaseContext}

Focus on: security best practices, cost optimization, reliability, and performance.
Respond with actionable suggestions in JSON format.`,
    }],
  });

  const block = message.content[0];
  return block.type === "text" ? block.text : "{}";
}

export async function diagnoseDeploymentError(
  error: string,
  context: string
): Promise<string> {
  const message = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    messages: [{
      role: "user",
      content: `Diagnose this deployment error and suggest a fix:

Error: ${error}
Context: ${context}

Be concise. Focus on the root cause and immediate fix.`,
    }],
  });

  const block = message.content[0];
  return block.type === "text" ? block.text : "Unable to diagnose.";
}
