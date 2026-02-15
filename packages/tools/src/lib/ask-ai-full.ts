/**
 * Full-Featured AI Query
 *
 * Supports two modes:
 * 1. **Full mode** (default): All Claude Code tools enabled
 * 2. **Bridge mode**: Site builder permissions with workspace isolation
 *
 * Uses the Claude Code instance credentials - no API key needed.
 *
 * @example
 * ```typescript
 * import { askAIFull, askBridge } from "@webalive/tools"
 *
 * // Full mode - all tools enabled
 * const result = await askAIFull({
 *   prompt: "Read the package.json and list dependencies",
 *   cwd: "/path/to/project",
 * })
 *
 * // Bridge mode - site builder permissions for a specific workspace
 * const result2 = await askAIFull({
 *   prompt: "Add a new component",
 *   workspace: "example.com",  // Enables Bridge mode
 * })
 *
 * // Bridge mode with OAuth tokens
 * const text = await askBridge("Create a checkout", "mysite.com", { stripe: "sk_..." })
 * ```
 */

import {
  type CanUseTool,
  query,
  type SDKMessage,
  type PermissionMode as SDKPermissionMode,
  type SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk"
import {
  buildStreamToolRuntimeConfig,
  createStreamCanUseTool,
  createStreamToolContext,
  DEFAULTS,
  getStreamMcpServers,
  getWorkspacePath,
  STREAM_PERMISSION_MODE,
  STREAM_SETTINGS_SOURCES,
} from "@webalive/shared"
import { toolsInternalMcp, workspaceInternalMcp } from "../mcp-server.js"
import { getEnabledMcpToolNames, withSearchToolsConnectedProviders } from "../tools/meta/search-tools.js"
// Import CLAUDE_MODELS from ask-ai.ts - SINGLE SOURCE OF TRUTH
import { CLAUDE_MODELS, type ClaudeModel } from "./ask-ai.js"

// Re-export for consumers
export { CLAUDE_MODELS, type ClaudeModel }

// =============================================================================
// CONSTANTS (only define what's NOT already in ask-ai.ts or shared)
// =============================================================================

export const PERMISSION_MODES = {
  BYPASS: "bypassPermissions",
  DEFAULT: "default",
  PLAN: "plan",
  ACCEPT_EDITS: "acceptEdits",
} as const

export type PermissionMode = SDKPermissionMode

export const SETTINGS_SOURCES = {
  PROJECT: "project",
  USER: "user",
} as const

export type SettingsSource = "project" | "user" | "managed"

// =============================================================================
// TYPES
// =============================================================================

export interface AskAIFullOptions {
  /** The prompt/task to send to Claude */
  prompt: string

  /** Working directory (full mode only, ignored in Bridge mode) */
  cwd?: string

  /** Workspace domain - enables Bridge mode (e.g., "example.com") */
  workspace?: string

  /** OAuth tokens for integrations (Bridge mode) */
  oauthTokens?: Record<string, string>

  /** Model to use (defaults to DEFAULTS.CLAUDE_MODEL) */
  model?: ClaudeModel | string

  /** Max turns (defaults to DEFAULTS.CLAUDE_MAX_TURNS) */
  maxTurns?: number

  /** System prompt */
  systemPrompt?: string

  /** Permission mode (full: "bypassPermissions", default: "default") */
  permissionMode?: PermissionMode

  /** Settings sources (defaults to ["project"]) */
  settingSources?: SettingsSource[]

  /** Session ID to resume */
  resume?: string

  /** Allowed tools (full mode only) */
  allowedTools?: string[]

  /** Disallowed tools (full mode only) */
  disallowedTools?: string[]

  /** MCP servers (full mode only) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mcpServers?: Record<string, any>

  /** Message callback */
  onMessage?: (message: SDKMessage) => void
}

export interface AskAIFullResult {
  text: string
  messages: SDKMessage[]
  sessionId?: string
  resultMessage: SDKResultMessage | null
  messageCount: number
  mode: "full" | "default"
  workspacePath?: string
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Ask Claude with configurable tool access.
 *
 * **Full Mode** (no workspace): All Claude Code tools
 * **Bridge Mode** (workspace provided): Site builder permissions
 */
export async function askAIFull(options: AskAIFullOptions): Promise<AskAIFullResult> {
  const {
    prompt,
    workspace,
    oauthTokens = {},
    model = DEFAULTS.CLAUDE_MODEL,
    maxTurns = DEFAULTS.CLAUDE_MAX_TURNS,
    systemPrompt,
    resume,
    onMessage,
  } = options

  const isBridgeMode = !!workspace
  const mode = isBridgeMode ? "default" : "full"
  const workspacePath = workspace ? getWorkspacePath(workspace) : undefined
  const cwd = isBridgeMode ? workspacePath! : (options.cwd ?? process.cwd())

  // Configure based on mode
  let permissionMode = options.permissionMode
  let allowedTools = options.allowedTools
  let disallowedTools = options.disallowedTools
  let mcpServers = options.mcpServers
  let canUseTool: CanUseTool | undefined
  let settingSources = options.settingSources ?? ["project"]
  let connectedProviders: string[] = []

  if (isBridgeMode) {
    permissionMode = permissionMode ?? STREAM_PERMISSION_MODE
    // Cast to SettingsSource[] - "managed" is valid for Claude Code but not in SDK types
    settingSources = [...STREAM_SETTINGS_SOURCES] as SettingsSource[]

    connectedProviders = Object.keys(oauthTokens).filter(k => !!oauthTokens[k])
    const context = createStreamToolContext({
      isAdmin: false,
      isSuperadmin: false,
      isSuperadminWorkspace: false,
      isPlanMode: permissionMode === "plan",
      connectedProviders,
    })

    // Note: ask-ai-full is used by MCP tools, not by admin users
    // Always use non-admin tools (isAdmin=false)
    const runtimeTools = buildStreamToolRuntimeConfig(getEnabledMcpToolNames, context)
    allowedTools = runtimeTools.allowedTools
    disallowedTools = runtimeTools.disallowedTools

    mcpServers = getStreamMcpServers(
      { "alive-workspace": workspaceInternalMcp, "alive-tools": toolsInternalMcp },
      oauthTokens,
    )

    canUseTool = createStreamCanUseTool(context, allowedTools) as CanUseTool
  } else {
    permissionMode = permissionMode ?? "bypassPermissions"
  }

  return await withSearchToolsConnectedProviders(connectedProviders, async () => {
    const agentQuery = query({
      prompt,
      options: {
        cwd,
        model,
        maxTurns,
        permissionMode,
        ...(permissionMode === "bypassPermissions" ? { allowDangerouslySkipPermissions: true } : {}),
        // Cast needed: "managed" is valid for Claude Code but not in SDK's SettingSource type
        settingSources: settingSources as ("project" | "user")[],
        systemPrompt,
        resume,
        allowedTools,
        disallowedTools,
        mcpServers,
        canUseTool,
      },
    })

    let responseText = ""
    const messages: SDKMessage[] = []
    let sessionId: string | undefined
    let resultMessage: SDKResultMessage | null = null
    let messageCount = 0

    for await (const message of agentQuery) {
      messageCount++
      messages.push(message)

      if (message.type === "system" && message.subtype === "init" && message.session_id) {
        sessionId = message.session_id
      }

      if (message.type === "result") {
        resultMessage = message
      }

      if (message.type === "assistant" && "message" in message) {
        const content = message.message.content
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "text") {
              responseText += block.text
            }
          }
        }
      }

      onMessage?.(message)
    }

    return {
      text: responseText,
      messages,
      sessionId,
      resultMessage,
      messageCount,
      mode,
      workspacePath,
    }
  })
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/** Ask with all tools (full mode) */
export async function ask(prompt: string, cwd?: string): Promise<string> {
  const result = await askAIFull({ prompt, cwd })
  return result.text
}

/** Ask in Bridge mode (site builder permissions) */
export async function askBridge(
  prompt: string,
  workspace: string,
  oauthTokens?: Record<string, string>,
): Promise<string> {
  const result = await askAIFull({ prompt, workspace, oauthTokens })
  return result.text
}
