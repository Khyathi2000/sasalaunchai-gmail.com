import Anthropic from "@anthropic-ai/sdk";
import type { ServiceRecommendation } from "../types/cloud";
import type { ParsedCodebase, AnalysisResult } from "../types/index";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export async function refineRecommendations(
  recommendations: ServiceRecommendation[],
  codebase: ParsedCodebase,
  analysis: AnalysisResult | undefined
): Promise<ServiceRecommendation[]> {
  if (!process.env.ANTHROPIC_API_KEY) return recommendations;

  const summary = analysis?.summary ?? `${codebase.repoName} with ${codebase.totalFiles} files`;
  const techStack = codebase.techStack.join(", ");

  const message = await getClient().messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: `Review these cloud service recommendations for a codebase and adjust if needed.

Codebase: ${summary}
Tech Stack: ${techStack}

Current recommendations:
${recommendations.map(r => `- ${r.serviceName}: ${r.reason} [confidence: ${r.confidence}]`).join("\n")}

Return a JSON array of adjustments. Each item should have:
- "serviceId": string
- "action": "keep" | "remove" | "adjust"
- "newConfidence": "high" | "medium" | "low" (if adjusting)
- "reason": string (why the adjustment)

Only include items that need changes. Output raw JSON array.`,
    }],
  });

  const block = message.content[0];
  if (block.type !== "text") return recommendations;

  try {
    const cleaned = block.text.replace(/^```[a-z]*\n?/gm, "").replace(/```$/gm, "").trim();
    const adjustments = JSON.parse(cleaned) as { serviceId: string; action: string; newConfidence?: string; reason?: string }[];

    for (const adj of adjustments) {
      if (adj.action === "remove") {
        const idx = recommendations.findIndex(r => r.serviceId === adj.serviceId);
        if (idx >= 0) recommendations.splice(idx, 1);
      } else if (adj.action === "adjust" && adj.newConfidence) {
        const rec = recommendations.find(r => r.serviceId === adj.serviceId);
        if (rec) {
          rec.confidence = adj.newConfidence as "high" | "medium" | "low";
          if (adj.reason) rec.reason = adj.reason;
        }
      }
    }
  } catch {
    // If parsing fails, return original recommendations
  }

  return recommendations;
}
