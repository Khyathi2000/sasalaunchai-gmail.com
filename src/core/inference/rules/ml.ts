import type { ParsedCodebase } from "../../types/index";
import type { ServiceRecommendation } from "../../types/cloud";

export function inferMLServices(codebase: ParsedCodebase, provider: string): ServiceRecommendation[] {
  const recs: ServiceRecommendation[] = [];
  const deps = getDeps(codebase);

  const hasVertexSdk = deps.has("@google-cloud/vertexai") || deps.has("@google-cloud/aiplatform");
  const hasAnthropic = deps.has("@anthropic-ai/sdk");
  const hasOpenAi = deps.has("openai");
  const hasLangchain = deps.has("langchain") || deps.has("@langchain/core");
  const hasCustomModel = codebase.files.some(
    (f) => f.path.endsWith(".ipynb") || f.path.includes("/models/") || f.path.endsWith(".pt") || f.path.endsWith(".onnx"),
  );

  const usesLLM = hasVertexSdk || hasAnthropic || hasOpenAi || hasLangchain || hasCustomModel;

  if (provider === "gcp" && usesLLM) {
    recs.push({
      serviceId: "vertex-ai",
      serviceName: "Vertex AI",
      category: "ml",
      provider: "gcp",
      reason:
        hasVertexSdk ? "Vertex AI SDK detected" :
        hasCustomModel ? "Notebook / model artifacts detected" :
        "LLM SDK detected — host inference on Vertex AI for managed serving",
      confidence: hasVertexSdk ? "high" : "medium",
      config: {},
      dependsOn: [],
    });
  }

  if (provider === "aws" && usesLLM) {
    recs.push({
      serviceId: "bedrock",
      serviceName: "Bedrock",
      category: "ml",
      provider: "aws",
      reason:
        hasAnthropic ? "Anthropic SDK detected — Bedrock can serve Claude with AWS-native auth" :
        hasOpenAi ? "OpenAI SDK detected — Bedrock provides the equivalent foundation models with AWS billing" :
        hasLangchain ? "LangChain detected — Bedrock works as a drop-in chat model" :
        hasCustomModel ? "Notebook / model artifacts detected — Bedrock for managed inference" :
        "LLM SDK detected — Bedrock for managed AWS-native inference",
      confidence: hasAnthropic || hasOpenAi ? "high" : "medium",
      config: {},
      dependsOn: ["iam"],
    });
  }

  return recs;
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
