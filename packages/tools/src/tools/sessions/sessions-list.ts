/**
 * sessions_list tool
 *
 * Lists active sessions the agent can interact with.
 * Filters based on A2A policy and session visibility.
 */

import { z } from "zod"
import type { SessionInfo, AgentToAgentPolicy } from "./types.js"
import { isA2AAllowed } from "./types.js"

export const sessionsListSchema = z.object({
  /** Filter by workspace domain */
  workspace: z.string().optional(),
  /** Filter by user ID */
  userId: z.string().optional(),
  /** Only show active (locked) sessions */
  activeOnly: z.boolean().optional(),
  /** Include message preview (last N messages) */
  messageLimit: z.number().min(0).max(20).optional(),
  /** Maximum sessions to return */
  limit: z.number().min(1).max(100).optional(),
  /** Only sessions active in last N minutes */
  activeMinutes: z.number().min(1).optional(),
})

export type SessionsListParams = z.infer<typeof sessionsListSchema>

export interface SessionsListContext {
  /** Current user ID (requester) */
  currentUserId: string
  /** Current workspace */
  currentWorkspace: string
  /** A2A policy */
  policy: AgentToAgentPolicy
  /** Function to fetch sessions from DB */
  fetchSessions: (params: {
    workspace?: string
    userId?: string
    activeMinutes?: number
    limit?: number
  }) => Promise<SessionInfo[]>
  /** Function to check if session is locked */
  isSessionLocked: (sessionKey: string) => boolean
  /** Function to get recent messages */
  getSessionMessages?: (sdkSessionId: string, limit: number) => Promise<Array<{ role: string; content: string }>>
}

export interface SessionsListResult {
  count: number
  sessions: Array<
    SessionInfo & {
      messages?: Array<{ role: string; content: string }>
    }
  >
}

export async function executeSessionsList(
  params: SessionsListParams,
  ctx: SessionsListContext,
): Promise<SessionsListResult> {
  const { workspace, userId, activeOnly, messageLimit, limit = 50, activeMinutes } = params

  // Fetch sessions with filters
  const allSessions = await ctx.fetchSessions({
    workspace: workspace ?? ctx.currentWorkspace,
    userId,
    activeMinutes,
    limit: limit * 2, // Fetch extra to account for filtering
  })

  // Filter by A2A policy
  const allowedSessions = allSessions.filter(session => {
    // Same user always visible
    if (session.userId === ctx.currentUserId) return true

    // Check A2A policy for cross-user access
    return isA2AAllowed(ctx.policy, ctx.currentUserId, session.userId)
  })

  // Filter by active status if requested
  const filteredSessions = activeOnly ? allowedSessions.filter(s => ctx.isSessionLocked(s.sessionKey)) : allowedSessions

  // Apply limit
  const limitedSessions = filteredSessions.slice(0, limit)

  // Add active status and optionally fetch messages
  const sessionsWithStatus = await Promise.all(
    limitedSessions.map(async session => {
      const result: SessionInfo & { messages?: Array<{ role: string; content: string }> } = {
        ...session,
        isActive: ctx.isSessionLocked(session.sessionKey),
      }

      // Fetch messages if requested
      if (messageLimit && messageLimit > 0 && ctx.getSessionMessages) {
        try {
          result.messages = await ctx.getSessionMessages(session.sdkSessionId, messageLimit)
        } catch {
          // Silently skip if messages unavailable
        }
      }

      return result
    }),
  )

  return {
    count: sessionsWithStatus.length,
    sessions: sessionsWithStatus,
  }
}

/**
 * Tool definition for Claude SDK
 */
export const sessionsListToolDefinition = {
  name: "sessions_list",
  description: `List active chat sessions. Use this to discover other sessions you can interact with.

Returns session metadata including:
- sessionKey: Unique identifier for the session
- workspace: The workspace/domain
- isActive: Whether an agent is currently running
- lastActivity: When the session was last used

Use sessions_send to message a session, or sessions_history to read its conversation.`,
  input_schema: {
    type: "object" as const,
    properties: {
      workspace: {
        type: "string",
        description: "Filter by workspace domain (default: current workspace)",
      },
      userId: {
        type: "string",
        description: "Filter by user ID (requires A2A policy permission)",
      },
      activeOnly: {
        type: "boolean",
        description: "Only show sessions with an agent currently running",
      },
      messageLimit: {
        type: "number",
        description: "Include last N messages from each session (0-20)",
      },
      limit: {
        type: "number",
        description: "Maximum sessions to return (default: 50, max: 100)",
      },
      activeMinutes: {
        type: "number",
        description: "Only sessions active in last N minutes",
      },
    },
    required: [],
  },
}
