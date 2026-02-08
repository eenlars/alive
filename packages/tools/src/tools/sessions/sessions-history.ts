/**
 * sessions_history tool
 *
 * Fetch conversation history from a session.
 * Useful for understanding context before sending a message.
 */

import { z } from "zod"
import type { AgentToAgentPolicy, SessionMessage } from "./types.js"
import { isA2AAllowed } from "./types.js"

export const sessionsHistorySchema = z.object({
  /** Target session key */
  sessionKey: z.string(),
  /** Maximum messages to return */
  limit: z.number().min(1).max(100).optional(),
  /** Include tool use/result messages */
  includeTools: z.boolean().optional(),
  /** Only messages after this timestamp (ISO) */
  after: z.string().optional(),
})

export type SessionsHistoryParams = z.infer<typeof sessionsHistorySchema>

export interface SessionsHistoryContext {
  /** Current user ID (requester) */
  currentUserId: string
  /** A2A policy */
  policy: AgentToAgentPolicy
  /** Function to resolve session key to user ID and SDK session ID */
  resolveSession: (sessionKey: string) => Promise<{ userId: string; sdkSessionId: string } | null>
  /** Function to fetch messages from SDK session */
  fetchMessages: (params: {
    sdkSessionId: string
    limit: number
    includeTools: boolean
    after?: string
  }) => Promise<SessionMessage[]>
}

export interface SessionsHistoryResult {
  sessionKey: string
  messages: SessionMessage[]
  count: number
}

export async function executeSessionsHistory(
  params: SessionsHistoryParams,
  ctx: SessionsHistoryContext,
): Promise<SessionsHistoryResult> {
  const { sessionKey, limit = 50, includeTools = false, after } = params

  // Resolve session
  const session = await ctx.resolveSession(sessionKey)
  if (!session) {
    return {
      sessionKey,
      messages: [],
      count: 0,
    }
  }

  // Check A2A policy for cross-user access
  if (session.userId !== ctx.currentUserId) {
    if (!ctx.policy.enabled) {
      throw new Error("Agent-to-agent history access is disabled.")
    }

    if (!isA2AAllowed(ctx.policy, ctx.currentUserId, session.userId)) {
      throw new Error("Agent-to-agent history access denied by policy.")
    }
  }

  // Fetch messages
  const messages = await ctx.fetchMessages({
    sdkSessionId: session.sdkSessionId,
    limit,
    includeTools,
    after,
  })

  return {
    sessionKey,
    messages,
    count: messages.length,
  }
}

/**
 * Tool definition for Claude SDK
 */
export const sessionsHistoryToolDefinition = {
  name: "sessions_history",
  description: `Fetch conversation history from a session.

Use this to understand what a session has been working on before sending a message.
Returns messages in chronological order (oldest first).

By default, tool use/result messages are excluded for readability.
Set includeTools: true to see the full conversation including tool calls.`,
  input_schema: {
    type: "object" as const,
    properties: {
      sessionKey: {
        type: "string",
        description: "Target session key (from sessions_list)",
      },
      limit: {
        type: "number",
        description: "Maximum messages to return (default: 50, max: 100)",
      },
      includeTools: {
        type: "boolean",
        description: "Include tool use/result messages (default: false)",
      },
      after: {
        type: "string",
        description: "Only return messages after this timestamp (ISO format)",
      },
    },
    required: ["sessionKey"],
  },
}
