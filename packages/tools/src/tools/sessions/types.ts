/**
 * Agent-to-Agent Communication Types
 *
 * Enables Claude agents to discover, message, and read history from other sessions.
 * Inspired by OpenClaw's sessions_list, sessions_send, sessions_history tools.
 */

/**
 * Session metadata returned by sessions_list
 */
export interface SessionInfo {
  /** Display key: userId::workspace::tabGroupId::tabId */
  sessionKey: string
  /** SDK session ID (for resumption) */
  sdkSessionId: string
  /** Workspace domain */
  workspace: string
  /** User ID who owns this session */
  userId: string
  /** Tab ID (unique per browser tab) */
  tabId: string
  /** Last activity timestamp (ISO) */
  lastActivity: string
  /** Session expiry (ISO) */
  expiresAt: string
  /** Whether session is currently locked (agent running) */
  isActive: boolean
  /** Optional label for the session */
  label?: string
}

/**
 * Message in session history
 */
export interface SessionMessage {
  role: "user" | "assistant" | "system"
  content: string
  timestamp?: string
  /** Tool use/result if applicable */
  toolUse?: {
    id: string
    name: string
    input?: unknown
  }
  toolResult?: {
    id: string
    content: string
    isError?: boolean
  }
}

/**
 * Result of sessions_send
 */
export interface SessionSendResult {
  status: "ok" | "accepted" | "error" | "timeout" | "forbidden"
  /** Unique run ID for this send operation */
  runId: string
  /** Target session key */
  sessionKey: string
  /** Reply from the target session (if waited) */
  reply?: string
  /** Error message if status is error/forbidden */
  error?: string
}

/**
 * Agent-to-agent policy configuration
 */
export interface AgentToAgentPolicy {
  /** Whether A2A is enabled */
  enabled: boolean
  /** Allowed patterns: "*" for all, or specific userId patterns */
  allowPatterns: string[]
  /** Denied patterns (takes precedence over allow) */
  denyPatterns: string[]
}

/**
 * Default A2A policy - disabled by default for security
 */
export const DEFAULT_A2A_POLICY: AgentToAgentPolicy = {
  enabled: false,
  allowPatterns: [],
  denyPatterns: [],
}

/**
 * Check if requester can access target session
 */
export function isA2AAllowed(policy: AgentToAgentPolicy, requesterUserId: string, targetUserId: string): boolean {
  if (!policy.enabled) return false

  // Same user always allowed
  if (requesterUserId === targetUserId) return true

  // Check deny patterns first
  for (const pattern of policy.denyPatterns) {
    if (pattern === "*" || pattern === targetUserId) {
      return false
    }
  }

  // Check allow patterns
  for (const pattern of policy.allowPatterns) {
    if (pattern === "*" || pattern === targetUserId) {
      return true
    }
  }

  return false
}
