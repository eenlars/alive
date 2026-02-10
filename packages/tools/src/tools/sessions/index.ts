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
 * import { sessionsListToolDefinition, sessionsSendToolDefinition } from "@webalive/tools"
 *
 * const tools = [
 *   sessionsListToolDefinition,
 *   sessionsSendToolDefinition,
 *   sessionsHistoryToolDefinition,
 * ]
 * ```
 */

// sessions_history
export {
  executeSessionsHistory,
  type SessionsHistoryContext,
  type SessionsHistoryParams,
  type SessionsHistoryResult,
  sessionsHistorySchema,
  sessionsHistoryToolDefinition,
} from "./sessions-history.js"
// sessions_list
export {
  executeSessionsList,
  type SessionsListContext,
  type SessionsListParams,
  type SessionsListResult,
  sessionsListSchema,
  sessionsListToolDefinition,
} from "./sessions-list.js"
// sessions_send
export {
  executeSessionsSend,
  type SessionsSendContext,
  type SessionsSendParams,
  sessionsSendSchema,
  sessionsSendToolDefinition,
} from "./sessions-send.js"
// Types
export type {
  AgentToAgentPolicy,
  SessionInfo,
  SessionMessage,
  SessionSendResult,
} from "./types.js"
export { DEFAULT_A2A_POLICY, isA2AAllowed } from "./types.js"
