/**
 * Execution Attempts
 *
 * Worker pool and child process execution strategies, each returning
 * an isolated AttemptResult. Failed attempts never leak state into
 * subsequent ones.
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
import { runAgentChild } from "@/lib/workspace-execution/agent-child-runner"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// =============================================================================
// Failure Classification
// =============================================================================

type FailureKind = "oom" | "heartbeat" | "spawn" | "socket" | "unknown"

export interface ClassifiedFailure {
  kind: FailureKind
  transient: boolean
  message: string
}

const FAILURE_PATTERNS: Array<{ pattern: string; kind: FailureKind }> = [
  { pattern: "out of memory", kind: "oom" },
  { pattern: "Worker disconnected unexpectedly", kind: "heartbeat" },
  { pattern: "crashed before becoming ready", kind: "spawn" },
  { pattern: "Worker spawn error", kind: "spawn" },
  { pattern: "Worker exited", kind: "heartbeat" },
  { pattern: "Socket connection timed out", kind: "socket" },
]

export function classifyFailure(error: unknown): ClassifiedFailure {
  const message = error instanceof Error ? error.message : String(error)
  for (const { pattern, kind } of FAILURE_PATTERNS) {
    if (message.includes(pattern)) {
      return { kind, transient: kind !== "oom", message }
    }
  }
  return { kind: "unknown", transient: false, message }
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
        oauthTokens: {},
        userEnvKeys: {},
        agentConfig,
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

// =============================================================================
// Child Process Attempt
// =============================================================================

interface ChildProcessParams extends ExecutionParams {
  apiKey: string
}

export async function runChildProcess(params: ChildProcessParams): Promise<AttemptResult> {
  const {
    requestId,
    cwd,
    fullPrompt,
    selectedModel,
    systemPrompt,
    timeoutSeconds,
    apiKey,
    extraTools,
    responseToolName,
  } = params

  console.log(`[Automation ${requestId}] Using child process runner`)

  const childStream = runAgentChild(cwd, {
    message: fullPrompt,
    model: selectedModel,
    maxTurns: DEFAULTS.CLAUDE_MAX_TURNS,
    systemPrompt,
    apiKey,
    isAdmin: false,
    isSuperadmin: false,
    extraTools,
  })

  const reader = childStream.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  const { state, collect } = createMessageCollector(responseToolName)

  const readLoop = (async () => {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line) as Record<string, unknown>
          // Child process messages have a flatter structure
          if (typeof msg.role === "string" && msg.role === "assistant" && Array.isArray(msg.content)) {
            state.allMessages.push(msg)
            for (const block of msg.content as unknown[]) {
              if (isRecord(block) && block.type === "text" && typeof block.text === "string") {
                state.textMessages.push(block.text)
              }
            }
            if (responseToolName) {
              const toolText = extractToolResponseText(msg.content as unknown[], responseToolName)
              if (toolText) state.toolResponseText = toolText
            }
          } else if (msg.type === "result" && isRecord(msg.data) && typeof msg.data.resultText === "string") {
            state.allMessages.push(msg)
            state.finalResponse = msg.data.resultText
          } else {
            collect(msg)
          }
        } catch {
          // Skip non-JSON lines
        }
      }
    }
  })()

  const abort = new AbortController()
  const timeoutId = setTimeout(() => abort.abort(), timeoutSeconds * 1000)

  const onAbort = () => {
    reader.cancel("Automation timeout").catch(() => {})
  }
  abort.signal.addEventListener("abort", onAbort, { once: true })

  try {
    await readLoop
    if (abort.signal.aborted) {
      throw new Error("Automation timeout")
    }
    return state
  } finally {
    clearTimeout(timeoutId)
    abort.signal.removeEventListener("abort", onAbort)
  }
}

export { WORKER_POOL }
