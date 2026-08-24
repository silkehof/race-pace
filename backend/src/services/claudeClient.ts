import { query } from "@anthropic-ai/claude-agent-sdk";
import { config } from "../config.js";
import {
  buildCoachTools,
  coachMcpServer,
  coachToolServerName,
  qualifiedToolName,
  type CapturedToolCall,
} from "../schemas/agentTools.js";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface CallClaudeParams {
  systemPersona: string;
  systemRules: string;
  /** Prior turns, oldest first — the client resends the whole conversation each call (this is a
   * stateless proxy, not a session store), so it's flattened into one prompt rather than using
   * the Agent SDK's own multi-turn session/resume mechanism. */
  history: ChatTurn[];
  userMessage: string;
  /** Workout IDs that exist in the athlete's current plan, for propose_plan_adjustment's
   * cross-check. Empty when there's no active plan yet (create_training_plan mode). */
  knownWorkoutIds: ReadonlySet<string>;
  /** Which coach tool(s) to expose this turn — scoped per mode, matching the mode-specific rules
   * block passed as systemRules. */
  enabledTools: Array<CapturedToolCall["name"]>;
}

export interface CallClaudeResult {
  /** Plain-text reply, if any (may be empty when the turn is only a tool call). */
  text: string;
  /** The validated tool call Claude made this turn, if any. */
  toolCall: CapturedToolCall | null;
}

const AUTH_ERROR_HINT =
  "Backend isn't authenticated with a Claude subscription — run `claude login` on this host " +
  "(see README) and make sure ANTHROPIC_API_KEY isn't set, which would otherwise take priority.";

function formatPrompt(history: ChatTurn[], userMessage: string): string {
  const transcript = history
    .map((turn) => `${turn.role === "user" ? "Athlete" : "Coach"}: ${turn.content}`)
    .join("\n\n");
  return transcript ? `${transcript}\n\nAthlete: ${userMessage}` : userMessage;
}

/** Strips API-key env vars from the subprocess env so a stray ANTHROPIC_API_KEY in .env can never
 * silently reactivate metered billing instead of the intended subscription login. */
function subprocessEnv(): NodeJS.ProcessEnv {
  const { ANTHROPIC_API_KEY: _key, ANTHROPIC_AUTH_TOKEN: _token, ...rest } = process.env;
  return rest;
}

export async function callClaude(params: CallClaudeParams): Promise<CallClaudeResult> {
  const captured: CapturedToolCall[] = [];
  const allTools = buildCoachTools(params.knownWorkoutIds, captured);
  const activeTools = params.enabledTools.map((name) => allTools[name]);

  let text = "";

  for await (const message of query({
    prompt: formatPrompt(params.history, params.userMessage),
    options: {
      model: config.anthropic.model,
      systemPrompt: [params.systemPersona, params.systemRules],
      tools: [], // no built-in Claude Code tools (Bash/Read/Edit/...) — this is a chat coach
      mcpServers: { [coachToolServerName]: coachMcpServer(activeTools) },
      allowedTools: params.enabledTools.map(qualifiedToolName),
      maxTurns: 4,
      env: subprocessEnv(),
    },
  })) {
    if (message.type === "assistant") {
      if (message.error === "authentication_failed") {
        throw new Error(AUTH_ERROR_HINT);
      }
      if (message.error) {
        throw new Error(`Claude turn failed: ${message.error}`);
      }
      for (const block of message.message.content) {
        if (block.type === "text") {
          text += block.text;
        }
      }
    } else if (message.type === "result" && message.subtype !== "success") {
      throw new Error(`Claude query failed (${message.subtype}), stop reason: ${message.stop_reason ?? "unknown"}`);
    }
  }

  return { text, toolCall: captured[captured.length - 1] ?? null };
}
