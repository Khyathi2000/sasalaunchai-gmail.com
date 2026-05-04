// Architect agent: a Claude tool-use loop that turns natural-language
// architecture requests into structured mutations.

import Anthropic from "@anthropic-ai/sdk";
import {
  applyTool,
  PRE_DEPLOY_TOOLS,
  POST_DEPLOY_TOOLS,
  type ArchitectState,
  type ArchitectTool,
  type MutationLog,
  type ToolName,
} from "./tools.js";

const MODEL = process.env.ARCHITECT_MODEL ?? "claude-sonnet-4-6";
const MAX_TOOL_TURNS = 5;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ArchitectResult {
  state: ArchitectState;
  mutations: MutationLog[];
  reply: string;
}

let _clientForTest: Pick<Anthropic, "messages"> | null = null;

/** Test hook — inject a fake Anthropic client. */
export function _setClientForTest(c: Pick<Anthropic, "messages"> | null): void {
  _clientForTest = c;
}

function client(): Pick<Anthropic, "messages"> {
  if (_clientForTest) return _clientForTest;
  return new Anthropic();
}

function systemPrompt(state: ArchitectState, mode: "pre-deploy" | "post-deploy"): string {
  const rec = state.recommendations
    .map((r) => `- ${r.serviceId} (${r.category}, ${r.provider}, depends on: ${r.dependsOn.join(", ") || "—"})`)
    .join("\n");
  return `You are the ARCHITECT, a tool-using assistant that helps the user shape their cloud architecture by calling structured tools. NEVER reply with prose-only when a tool would clearly apply. After your tool call(s), summarize what you did in 1-2 sentences.

Current provider: ${state.provider}
Current region:   ${state.region}
Current services (${state.recommendations.length}):
${rec || "(none yet)"}

Mode: ${mode}

When the user says "add X", "swap Y for Z", "use serverless", "switch to GCP", etc., call the corresponding tool. If the user is asking a general question, respond conversationally — no tool needed.`;
}

function tools(mode: "pre-deploy" | "post-deploy"): ArchitectTool[] {
  return mode === "post-deploy" ? POST_DEPLOY_TOOLS : PRE_DEPLOY_TOOLS;
}

/** One round trip with the architect. Runs the tool-use loop until
 * Claude stops calling tools (or the cap is hit). */
export async function runArchitectTurn(opts: {
  state: ArchitectState;
  history: ChatMessage[];
  userMessage: string;
  mode: "pre-deploy" | "post-deploy";
}): Promise<ArchitectResult> {
  const c = client();
  const tdefs = tools(opts.mode);
  let state = opts.state;
  const mutations: MutationLog[] = [];

  // Build the conversation: prior history + the new user message.
  const messages: Anthropic.MessageParam[] = [
    ...opts.history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: opts.userMessage },
  ];

  let finalText = "";

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const resp = await c.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt(state, opts.mode),
      tools: tdefs,
      messages,
    });

    // Append the assistant's full response so the next turn can refer to it.
    messages.push({ role: "assistant", content: resp.content });

    const toolUses = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const textBlocks = resp.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
    if (textBlocks.length) finalText = textBlocks.map((b) => b.text).join("\n");

    if (toolUses.length === 0) {
      // No tool call — we're done.
      break;
    }

    // Execute each tool call locally and feed the result back.
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const tool = tu.name as ToolName;
      const input = (tu.input as Record<string, unknown>) ?? {};
      try {
        const { state: newState, mutation } = applyTool(state, tool, input);
        state = newState;
        mutations.push(mutation);
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify({
            ok: true,
            servicesAfter: state.recommendations.length,
            provider: state.provider,
            region: state.region,
          }),
        });
      } catch (err) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify({
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          }),
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: toolResults });

    if (resp.stop_reason !== "tool_use") break;
  }

  return { state, mutations, reply: finalText };
}
