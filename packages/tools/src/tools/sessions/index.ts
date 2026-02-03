/**
 * Agent-to-Agent (A2A) Session Tools
 *
 * Enables Claude agents to:
 * - Discover other active sessions (sessions_list)
 * - Send messages to other sessions (sessions_send)
 * - Read conversation history from sessions (sessions_history)
 *
 * Inspired by OpenClaw's A2A implementation.
 *
 * @example
 * ```typescript
 * // In Claude SDK tool configuration
 * import { sessionsListToolDefinition, sessionsSendToolDefinition } from "@alive-brug/tools"
 *
 * const tools = [
 *   sessionsListToolDefinition,
 *   sessionsSendToolDefinition,
 *   sessionsHistoryToolDefinition,
 * ]
 * ```
 */

// Types
export type {
  SessionInfo,
  SessionMessage,
  SessionSendResult,
  AgentToAgentPolicy,
} from "./types.js"

export { DEFAULT_A2A_POLICY, isA2AAllowed } from "./types.js"

// sessions_list
export {
  sessionsListSchema,
  executeSessionsList,
  sessionsListToolDefinition,
  type SessionsListParams,
  type SessionsListContext,
  type SessionsListResult,
} from "./sessions-list.js"

// sessions_send
export {
  sessionsSendSchema,
  executeSessionsSend,
  sessionsSendToolDefinition,
  type SessionsSendParams,
  type SessionsSendContext,
} from "./sessions-send.js"

// sessions_history
export {
  sessionsHistorySchema,
  executeSessionsHistory,
  sessionsHistoryToolDefinition,
  type SessionsHistoryParams,
  type SessionsHistoryContext,
  type SessionsHistoryResult,
} from "./sessions-history.js"
