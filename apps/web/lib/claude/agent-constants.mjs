import { getEnabledMcpToolNames, toolsInternalMcp, workspaceInternalMcp } from "@alive-brug/tools"
import {
  // Single source of truth for Bridge tool configuration
  BRIDGE_ALLOWED_SDK_TOOLS,
  BRIDGE_INTERRUPT_SOURCES,
  BRIDGE_PERMISSION_MODE,
  BRIDGE_SETTINGS_SOURCES,
  BRIDGE_STREAM_TYPES,
  BRIDGE_SYNTHETIC_MESSAGE_TYPES,
  getBridgeAllowedTools,
  getBridgeDisallowedTools,
  getBridgeMcpServers,
  getGlobalMcpToolNames,
  OAUTH_MCP_PROVIDERS,
} from "@webalive/shared"

// Re-export stream types
export { BRIDGE_STREAM_TYPES, BRIDGE_SYNTHETIC_MESSAGE_TYPES, BRIDGE_INTERRUPT_SOURCES }

// Re-export SDK tools from shared (single source of truth)
export const ALLOWED_SDK_TOOLS = BRIDGE_ALLOWED_SDK_TOOLS
export const PERMISSION_MODE = BRIDGE_PERMISSION_MODE
/** @type {import('@anthropic-ai/claude-agent-sdk').SettingSource[]} */
export const SETTINGS_SOURCES = BRIDGE_SETTINGS_SOURCES

// MCP tools (auto-generated from TOOL_REGISTRY)
const BASE_MCP_TOOLS = getEnabledMcpToolNames()
const GLOBAL_MCP_TOOLS = getGlobalMcpToolNames()
export const ALLOWED_MCP_TOOLS = [...BASE_MCP_TOOLS, ...GLOBAL_MCP_TOOLS]

/**
 * Get base allowed tools (SDK tools + internal MCP tools)
 * @param {string} _workspacePath - Path to workspace (unused, kept for backwards compat)
 * @param {boolean} [isAdmin=false] - Whether the user is an admin (enables Bash tools)
 * @param {boolean} [isSuperadmin=false] - Whether the user is a superadmin (enables ALL tools)
 * @returns {string[]} Base allowed tools list
 */
export function getAllowedTools(_workspacePath, isAdmin = false, isSuperadmin = false) {
  return getBridgeAllowedTools(getEnabledMcpToolNames, isAdmin, isSuperadmin)
}

/**
 * Get disallowed tools based on admin/superadmin status
 * @param {boolean} [isAdmin=false] - Whether the user is an admin
 * @param {boolean} [isSuperadmin=false] - Whether the user is a superadmin (no tools blocked)
 * @returns {string[]} Disallowed tools list
 */
export function getDisallowedTools(isAdmin = false, isSuperadmin = false) {
  return getBridgeDisallowedTools(isAdmin, isSuperadmin)
}

/**
 * Get MCP servers configuration
 * @param {string} _workspacePath - Path to workspace (unused)
 * @param {Object} options - Options with oauthTokens
 * @returns {Object} MCP servers configuration
 */
export function getMcpServers(_workspacePath, options = {}) {
  return getBridgeMcpServers(
    { "alive-workspace": workspaceInternalMcp, "alive-tools": toolsInternalMcp },
    options.oauthTokens || {},
  )
}

/**
 * Get ONLY the OAuth MCP servers (HTTP-based, serializable via JSON).
 * Used by worker pool since internal MCP servers can't be serialized via IPC.
 * @param {Record<string, string>} [oauthTokens] - OAuth tokens keyed by provider
 * @returns {Object} OAuth MCP servers configuration (serializable)
 */
export function getOAuthMcpServers(oauthTokens = {}) {
  const servers = {}
  for (const [providerKey, config] of Object.entries(OAUTH_MCP_PROVIDERS)) {
    const token = oauthTokens[providerKey]
    if (token) {
      servers[providerKey] = {
        type: "http",
        url: config.url,
        headers: { Authorization: `Bearer ${token}` },
      }
    }
  }
  return servers
}

/**
 * @deprecated Use OAuth connection checks instead
 */
export function hasStripeMcpAccess(_workspacePath, hasStripeConnection = false) {
  return hasStripeConnection
}
