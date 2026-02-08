/**
 * Stream Tools Configuration
 *
 * SOURCE OF TRUTH for SDK tool permissions and Stream agent configuration.
 *
 * This file defines:
 * - Which SDK tools are allowed/disallowed in Stream mode
 * - Helper functions for building tool lists and MCP servers
 *
 * Used by:
 * - apps/web/lib/claude/agent-constants.mjs (runtime)
 * - apps/web/lib/claude/sdk-tools-sync.ts (type validation)
 * - packages/tools/src/lib/ask-ai-full.ts (askAIFull Stream mode)
 */

import { PATHS } from "./config.js"
import { OAUTH_MCP_PROVIDERS, GLOBAL_MCP_PROVIDERS, isOAuthMcpTool } from "./mcp-providers.js"

// =============================================================================
// SDK TOOL DEFINITIONS
// =============================================================================

/**
 * SDK built-in tools we ALLOW in the Stream.
 *
 * Categories:
 * - File operations: Read, Write, Edit, Glob, Grep (workspace-scoped)
 * - Planning/workflow: ExitPlanMode, TodoWrite
 * - MCP integration: ListMcpResources, Mcp, ReadMcpResource
 * - Other safe: NotebookEdit, WebFetch, AskUserQuestion
 */
// Use regular arrays (not as const) for compatibility with SDK types that expect string[]
export const STREAM_ALLOWED_SDK_TOOLS: string[] = [
  // File operations (workspace-scoped)
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  // Shell execution (available to all users)
  "Bash",
  "TaskOutput",
  // Legacy alias used by older Claude Code SDK versions
  "BashOutput",
  // Planning & workflow
  // NOTE: ExitPlanMode is intentionally NOT here - it requires user approval
  // When Claude tries to use it, canUseTool() denies with a message asking user to approve
  "TodoWrite",
  // MCP integration
  "ListMcpResources",
  "Mcp",
  "ReadMcpResource",
  // Other safe tools
  "NotebookEdit",
  "WebFetch",
  "AskUserQuestion",
  // Skills (loaded from ~/.claude/skills/ or project .claude/skills/)
  "Skill",
]

export type StreamAllowedSDKTool =
  | "Read"
  | "Write"
  | "Edit"
  | "Glob"
  | "Grep"
  | "Bash"
  | "TaskOutput"
  | "BashOutput"
  // ExitPlanMode intentionally omitted - requires user approval
  | "TodoWrite"
  | "ListMcpResources"
  | "Mcp"
  | "ReadMcpResource"
  | "NotebookEdit"
  | "WebFetch"
  | "AskUserQuestion"
  | "Skill"

/**
 * Admin-only SDK tools.
 * TaskStop is admin-only because it can terminate background tasks.
 * Bash/TaskOutput/BashOutput are in STREAM_ALLOWED_SDK_TOOLS (available to all users).
 */
export const STREAM_ADMIN_ONLY_SDK_TOOLS = ["TaskStop"] as const
export type StreamAdminOnlySDKTool = (typeof STREAM_ADMIN_ONLY_SDK_TOOLS)[number]

/**
 * SDK tools we ALWAYS DISALLOW in the Stream (even for admins).
 *
 * Why disallowed:
 * - Task: Subagent spawning - not supported in Stream architecture
 * - WebSearch: External web access - not needed, cost concerns
 * - ExitPlanMode: Requires user approval - Claude cannot approve its own plan
 *
 * Note: Superadmins get ALL tools including these.
 */
export const STREAM_ALWAYS_DISALLOWED_SDK_TOOLS = ["Task", "WebSearch", "ExitPlanMode"] as const
export type StreamAlwaysDisallowedSDKTool = (typeof STREAM_ALWAYS_DISALLOWED_SDK_TOOLS)[number]

/**
 * Tools blocked in plan mode (read-only exploration).
 *
 * Plan mode allows Claude to explore and analyze without modifications.
 * When plan mode is enabled, these tools are filtered OUT of allowedTools
 * before passing to the SDK.
 *
 * ARCHITECTURE NOTE: The Claude SDK only calls canUseTool() for tools NOT in
 * the allowedTools array. Tools IN allowedTools are auto-allowed without checking.
 * Therefore, we must filter blocked tools from allowedTools, not just deny in canUseTool.
 *
 * See: docs/architecture/plan-mode.md
 */
export const PLAN_MODE_BLOCKED_TOOLS = [
  // SDK file modification tools
  "Write",
  "Edit",
  "MultiEdit",
  "Bash",
  "NotebookEdit",
  // MCP tools that modify workspace
  "mcp__alive-workspace__delete_file",
  "mcp__alive-workspace__install_package",
  "mcp__alive-workspace__restart_dev_server",
  "mcp__alive-workspace__switch_serve_mode",
  "mcp__alive-workspace__create_website",
] as const
export type PlanModeBlockedTool = (typeof PLAN_MODE_BLOCKED_TOOLS)[number]

/**
 * MCP tools only available to superadmins.
 *
 * These are experimental/advanced tools not ready for general use.
 * Currently empty - ask_clarification moved to general availability.
 */
export const STREAM_SUPERADMIN_ONLY_MCP_TOOLS: readonly string[] = []
export type StreamSuperadminOnlyMcpTool = string

/**
 * Get disallowed SDK tools based on admin/superadmin status.
 *
 * @param isAdmin - Whether the user is an admin
 * @param isSuperadmin - Whether the user is a superadmin (gets ALL tools)
 * @returns Array of disallowed tool names
 */
export function getStreamDisallowedTools(isAdmin: boolean, isSuperadmin = false): string[] {
  // Superadmins have nothing blocked
  if (isSuperadmin) {
    return []
  }
  if (isAdmin) {
    // Admins only have Task and WebSearch blocked
    return [...STREAM_ALWAYS_DISALLOWED_SDK_TOOLS]
  }
  // Non-admins have Bash tools + always-disallowed blocked
  return [...STREAM_ADMIN_ONLY_SDK_TOOLS, ...STREAM_ALWAYS_DISALLOWED_SDK_TOOLS]
}

export type StreamDisallowedSDKTool = StreamAdminOnlySDKTool | StreamAlwaysDisallowedSDKTool

/**
 * Default permission mode for Stream
 */
export const STREAM_PERMISSION_MODE = "default" as const

/**
 * Default settings sources for Stream
 *
 * Hierarchy (highest to lowest precedence):
 * - project: {cwd}/.claude/ (workspace-specific)
 * - user: ~/.claude/ (user-level)
 *
 * Global skills flow:
 * 1. Git-tracked in .claude/skills/ (source of truth)
 * 2. Synced to /etc/claude-code/skills/ during deploy (build-and-serve.sh)
 * 3. Copied to worker temp HOME's .claude/skills/ at startup (worker-entry.mjs)
 *
 * Users can add workspace-specific skills in {workspace}/.claude/skills/ (project scope)
 */
export const STREAM_SETTINGS_SOURCES = ["project", "user"] as const

const EXACT_HEAVY_BASH_COMMANDS = new Set([
  "bun run build",
  "bun run type-check",
  "bun run lint",
  "bun run static-check",
  "bun run check:pre-push",
  "bun run check:all",
  "npm run build",
  "npm run type-check",
  "npm run lint",
  "pnpm run build",
  "pnpm run type-check",
  "pnpm run lint",
  "yarn build",
  "yarn type-check",
  "yarn lint",
  "next build",
  "claude",
])

const HEAVY_BASH_PATTERNS = [
  /\b(?:tsc|npx\s+tsc|bunx?\s+tsc|pnpm\s+tsc|yarn\s+tsc)\b/,
  /(?:^|(?:&&|\|\||\||;)\s*)(?:\.\/)?claude(?:\b|$)/,
  /(?:^|(?:&&|\|\||\||;)\s*)(?:npx|bunx?|pnpm\s+dlx|yarn\s+dlx)\s+(?:\.\/)?claude(?:\b|$)/,
  /claude-agent-sdk\/cli\.js/,
  /\b(turbo|bun run turbo)\s+run\s+(build|type-check|lint|test)\b/,
]

// =============================================================================
// TOOL PERMISSION HELPERS
// =============================================================================

/**
 * Tool permission response for allowing a tool.
 */
export function allowTool(input: Record<string, unknown>) {
  return { behavior: "allow" as const, updatedInput: input, updatedPermissions: [] }
}

/**
 * Tool permission response for denying a tool.
 */
export function denyTool(message: string) {
  return { behavior: "deny" as const, message }
}

/**
 * Detect shell commands that are known to be expensive at monorepo scope.
 * This is a conservative deny-list used to protect shared CPU capacity.
 */
export function isHeavyBashCommand(command: unknown): boolean {
  if (typeof command !== "string") return false
  const normalized = command.toLowerCase().trim().replace(/\s+/g, " ")
  if (!normalized) return false
  if (EXACT_HEAVY_BASH_COMMANDS.has(normalized)) return true
  return HEAVY_BASH_PATTERNS.some(pattern => pattern.test(normalized))
}

/**
 * Filter allowed tools for plan mode.
 *
 * Plan mode is read-only exploration - must remove modification tools
 * BEFORE passing to SDK (SDK auto-allows tools in allowedTools).
 */
export function filterToolsForPlanMode(allowedTools: string[], isPlanMode: boolean): string[] {
  if (!isPlanMode) return allowedTools
  const blocked: readonly string[] = PLAN_MODE_BLOCKED_TOOLS
  return allowedTools.filter(t => !blocked.includes(t))
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get all allowed tools for Stream mode (SDK + MCP tools).
 *
 * @param getEnabledMcpToolNames - Function to get enabled MCP tool names from @webalive/tools
 * @param isAdmin - Whether the user is an admin (enables Bash tools)
 * @param isSuperadmin - Whether the user is a superadmin (gets ALL tools)
 * @returns Array of allowed tool names
 */
export function getStreamAllowedTools(
  getEnabledMcpToolNames: () => string[],
  isAdmin = false,
  isSuperadmin = false,
): string[] {
  const mcpTools = getEnabledMcpToolNames()
  const globalMcpTools = Object.values(GLOBAL_MCP_PROVIDERS).flatMap(p => [...p.knownTools])

  // Superadmins get ALL tools (including Task, WebSearch, superadmin-only MCP tools)
  if (isSuperadmin) {
    return [
      ...STREAM_ALLOWED_SDK_TOOLS,
      ...STREAM_ADMIN_ONLY_SDK_TOOLS,
      ...STREAM_ALWAYS_DISALLOWED_SDK_TOOLS, // Task, WebSearch enabled for superadmin
      ...mcpTools,
      ...globalMcpTools,
      ...STREAM_SUPERADMIN_ONLY_MCP_TOOLS, // Superadmin-only MCP tools
    ]
  }

  const adminTools = isAdmin ? [...STREAM_ADMIN_ONLY_SDK_TOOLS] : []
  return [...STREAM_ALLOWED_SDK_TOOLS, ...adminTools, ...mcpTools, ...globalMcpTools]
}

/**
 * MCP server configuration type (simplified for serialization)
 */
export interface StreamMcpServerConfig {
  type: "http" | "sdk"
  url?: string
  headers?: Record<string, string>
}

/**
 * Get MCP servers configuration for Stream mode.
 *
 * @param internalMcpServers - Internal MCP servers from @webalive/tools
 * @param oauthTokens - OAuth tokens keyed by provider
 * @returns MCP servers configuration
 */
export function getStreamMcpServers<T>(
  internalMcpServers: { "alive-workspace": T; "alive-tools": T },
  oauthTokens: Record<string, string> = {},
): Record<string, T | StreamMcpServerConfig> {
  const servers: Record<string, T | StreamMcpServerConfig> = {
    "alive-workspace": internalMcpServers["alive-workspace"],
    "alive-tools": internalMcpServers["alive-tools"],
  }

  // Add OAuth MCP servers for connected providers
  for (const [providerKey, config] of Object.entries(OAUTH_MCP_PROVIDERS)) {
    const token = oauthTokens[providerKey]
    if (token) {
      servers[providerKey] = {
        type: "http",
        url: config.url,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    }
  }

  // Add global MCP servers (always available, no auth required)
  for (const [providerKey, config] of Object.entries(GLOBAL_MCP_PROVIDERS)) {
    servers[providerKey] = {
      type: "http",
      url: config.url,
    }
  }

  return servers
}

/**
 * Create canUseTool handler for Stream mode.
 *
 * @param baseAllowedTools - Base allowed tools array
 * @param connectedProviders - Array of connected OAuth provider keys
 * @param isAdmin - Whether the user is an admin (enables Bash tools)
 * @returns Permission handler function
 */
export function createStreamCanUseTool(
  baseAllowedTools: string[],
  connectedProviders: string[],
  isAdmin = false,
): (
  toolName: string,
  input: Record<string, unknown>,
) => Promise<{
  behavior: "allow" | "deny"
  message?: string
  updatedInput?: Record<string, unknown>
  updatedPermissions?: unknown[]
}> {
  // Get disallowed tools based on admin status
  const disallowedTools = getStreamDisallowedTools(isAdmin)

  return async (toolName, input) => {
    // Explicit deny list takes precedence (respects admin status)
    if (disallowedTools.includes(toolName)) {
      return {
        behavior: "deny",
        message: `Tool "${toolName}" is not available in site builder mode.`,
      }
    }

    // Check base allowed tools (SDK + internal MCP tools + admin tools if applicable)
    if (baseAllowedTools.includes(toolName)) {
      return {
        behavior: "allow",
        updatedInput: input,
        updatedPermissions: [],
      }
    }

    // Check OAuth MCP tools - auto-allowed if user has that provider connected
    if (isOAuthMcpTool(toolName, connectedProviders)) {
      return {
        behavior: "allow",
        updatedInput: input,
        updatedPermissions: [],
      }
    }

    // Tool not in any allowed list
    return {
      behavior: "deny",
      message: `Tool "${toolName}" is not permitted. Connect the required integration in Settings to use this tool.`,
    }
  }
}

/**
 * Get workspace path for a domain.
 *
 * @param domain - Domain name (e.g., "example.com")
 * @returns Full workspace path
 */
export function getWorkspacePath(domain: string): string {
  return `${PATHS.SITES_ROOT}/${domain}/user`
}
