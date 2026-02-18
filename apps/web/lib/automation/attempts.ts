/**
 * Execution Attempts
 *
 * Worker-pool execution strategy returning an isolated AttemptResult.
 */

import { statSync } from "node:fs"
import { DEFAULTS, WORKER_POOL } from "@webalive/shared"
import {
  getAllowedTools,
  getDisallowedTools,
  PERMISSION_MODE,
  SETTINGS_SOURCES,
  STREAM_TYPES,
} from "@/lib/claude/agent-constants.mjs"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// =============================================================================
// Isolated Attempt Result
// =============================================================================

/** Each execution attempt produces its own isolated result */
export interface AttemptResult {
  textMessages: string[]
  allMessages: unknown[]
  finalResponse: string
  /** Text extracted from a named tool call's input.text (set via responseToolName) */
  toolResponseText?: string
  costUsd?: number
  numTurns?: number
  usage?: { input_tokens: number; output_tokens: number }
}

/**
 * Extract input.text from a tool_use block matching the given tool name.
 * Matches both exact name and MCP-prefixed name (e.g. "send_reply" matches "mcp__alive-email__send_reply").
 */
function extractToolResponseText(blocks: unknown[], toolName: string): string | undefined {
  for (const block of blocks) {
    if (
      isRecord(block) &&
      block.type === "tool_use" &&
      typeof block.name === "string" &&
      (block.name === toolName || block.name.endsWith(`__${toolName}`)) &&
      isRecord(block.input) &&
      typeof block.input.text === "string"
    ) {
      return block.input.text
    }
  }
  return undefined
}

/**
 * Create a fresh, isolated message collector for a single attempt.
 * @param responseToolName — when set, extracts input.text from matching tool_use blocks
 */
function createMessageCollector(responseToolName?: string): {
  state: AttemptResult
  collect: (msg: Record<string, unknown>) => void
} {
  const state: AttemptResult = {
    textMessages: [],
    allMessages: [],
    finalResponse: "",
  }

  const collect = (msg: Record<string, unknown>) => {
    if (msg.type === "message" && typeof msg.content === "object" && msg.content !== null) {
      state.allMessages.push(msg.content)

      const content = msg.content
      if (!isRecord(content)) return

      if (content.role === "assistant" && Array.isArray(content.content)) {
        for (const block of content.content) {
          if (isRecord(block) && block.type === "text" && typeof block.text === "string") {
            state.textMessages.push(block.text)
          }
        }
        if (responseToolName) {
          const toolText = extractToolResponseText(content.content as unknown[], responseToolName)
          if (toolText) state.toolResponseText = toolText
        }
      }
      if (content.messageType === "assistant" && isRecord(content.content)) {
        const inner = content.content
        // Worker pool wraps SDK messages: content.message.content has the text blocks
        if (isRecord(inner.message)) {
          const message = inner.message
          if (Array.isArray(message.content)) {
            for (const block of message.content) {
              if (isRecord(block) && block.type === "text" && typeof block.text === "string") {
                state.textMessages.push(block.text)
              }
            }
            if (responseToolName) {
              const toolText = extractToolResponseText(message.content as unknown[], responseToolName)
              if (toolText) state.toolResponseText = toolText
            }
          }
        }
      }
    } else if (msg.type === "complete" && isRecord(msg.result)) {
      state.allMessages.push(msg)
      const result = msg.result
      // Worker pool: result.result is the SDK result object
      if (isRecord(result.result)) {
        const sdkResult = result.result
        if (sdkResult.subtype === "success" && typeof sdkResult.result === "string") {
          state.finalResponse = sdkResult.result
        }
        if (typeof sdkResult.total_cost_usd === "number") {
          state.costUsd = sdkResult.total_cost_usd
        }
        if (typeof sdkResult.num_turns === "number") {
          state.numTurns = sdkResult.num_turns
        }
        if (isRecord(sdkResult.usage)) {
          const u = sdkResult.usage
          if (typeof u.input_tokens === "number" && typeof u.output_tokens === "number") {
            state.usage = { input_tokens: u.input_tokens, output_tokens: u.output_tokens }
          }
        }
      }
    }
  }

  return { state, collect }
}

// =============================================================================
// Worker Pool Attempt
// =============================================================================

export interface ExecutionParams {
  requestId: string
  cwd: string
  fullPrompt: string
  selectedModel: string
  systemPrompt: string
  timeoutSeconds: number
  /** Additional MCP tool names to register */
  extraTools?: string[]
  /** Extract response from this tool's input.text */
  responseToolName?: string
}

interface WorkerPoolParams extends ExecutionParams {
  workspace: string
  userId: string
  oauthAccessToken: string
  /** Session cookie for authenticating API callbacks (e.g. restart_dev_server) */
  sessionCookie?: string
}

export async function tryWorkerPool(params: WorkerPoolParams): Promise<AttemptResult> {
  const {
    requestId,
    cwd,
    workspace,
    userId,
    fullPrompt,
    selectedModel,
    systemPrompt,
    timeoutSeconds,
    extraTools,
    responseToolName,
    oauthAccessToken,
    sessionCookie,
  } = params

  const { getWorkerPool } = await import("@webalive/worker-pool")

  const st = statSync(cwd)
  const credentials = {
    uid: st.uid,
    gid: st.gid,
    cwd,
    workspaceKey: workspace,
  }

  const allowedTools = Array.from(new Set([...getAllowedTools(cwd, false, false), ...(extraTools ?? [])]))

  const agentConfig = {
    allowedTools,
    disallowedTools: getDisallowedTools(false, false),
    permissionMode: PERMISSION_MODE,
    settingSources: SETTINGS_SOURCES,
    oauthMcpServers: {} as Record<string, unknown>,
    streamTypes: STREAM_TYPES,
    isAdmin: false,
    isSuperadmin: false,
    extraTools,
  }

  const pool = getWorkerPool()
  const abort = new AbortController()
  const timeoutId = setTimeout(() => abort.abort(), timeoutSeconds * 1000)

  const { state, collect } = createMessageCollector(responseToolName)

  try {
    await pool.query(credentials, {
      requestId,
      ownerKey: userId,
      workloadClass: "automation",
      payload: {
        message: fullPrompt,
        model: selectedModel,
        maxTurns: DEFAULTS.CLAUDE_MAX_TURNS,
        systemPrompt,
        oauthAccessToken,
        oauthTokens: {},
        userEnvKeys: {},
        agentConfig,
        sessionCookie,
      },
      onMessage: (msg: Record<string, unknown>) => {
        console.log(`[Automation ${requestId}] Message: type=${String(msg.type ?? "unknown")}`)
        collect(msg)
      },
      signal: abort.signal,
    })
    return state
  } finally {
    clearTimeout(timeoutId)
  }
}

export { WORKER_POOL }
