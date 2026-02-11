/**
 * sessions_send tool
 *
 * Send a message to another session, triggering an agent run.
 * Can wait for response or fire-and-forget.
 */

import { z } from "zod"
import type { AgentToAgentPolicy, SessionSendResult } from "./types.js"
import { isA2AAllowed } from "./types.js"

export const sessionsSendSchema = z.object({
  /** Target session key */
  sessionKey: z.string(),
  /** Message to send */
  message: z.string().min(1),
  /** Timeout in seconds (0 = fire-and-forget) */
  timeoutSeconds: z.number().min(0).max(300).optional(),
  /** Whether to wait for and return the response */
  waitForReply: z.boolean().optional(),
})

export type SessionsSendParams = z.infer<typeof sessionsSendSchema>

export interface SessionsSendContext {
  /** Current user ID (requester) */
  currentUserId: string
  /** Current session key (for context in target) */
  currentSessionKey: string
  /** A2A policy */
  policy: AgentToAgentPolicy
  /** Function to resolve session key to user ID */
  resolveSessionUserId: (sessionKey: string) => Promise<string | null>
  /** Function to send message to session */
  sendToSession: (params: {
    targetSessionKey: string
    message: string
    fromSessionKey: string
    timeoutMs: number
    waitForReply: boolean
  }) => Promise<{
    runId: string
    status: "ok" | "accepted" | "error" | "timeout"
    reply?: string
    error?: string
  }>
}

export async function executeSessionsSend(
  params: SessionsSendParams,
  ctx: SessionsSendContext,
): Promise<SessionSendResult> {
  const { sessionKey, message, timeoutSeconds = 30, waitForReply = true } = params
  const runId = crypto.randomUUID()

  // Resolve target user ID
  const targetUserId = await ctx.resolveSessionUserId(sessionKey)
  if (!targetUserId) {
    return {
      status: "error",
      runId,
      sessionKey,
      error: `Session not found: ${sessionKey}`,
    }
  }

  // Check A2A policy
  if (targetUserId !== ctx.currentUserId) {
    if (!ctx.policy.enabled) {
      return {
        status: "forbidden",
        runId,
        sessionKey,
        error: "Agent-to-agent messaging is disabled. Contact admin to enable A2A policy.",
      }
    }

    if (!isA2AAllowed(ctx.policy, ctx.currentUserId, targetUserId)) {
      return {
        status: "forbidden",
        runId,
        sessionKey,
        error: "Agent-to-agent messaging denied by policy.",
      }
    }
  }

  // Send the message
  try {
    const result = await ctx.sendToSession({
      targetSessionKey: sessionKey,
      message,
      fromSessionKey: ctx.currentSessionKey,
      timeoutMs: timeoutSeconds * 1000,
      waitForReply,
    })

    return {
      status: result.status,
      runId: result.runId,
      sessionKey,
      reply: result.reply,
      error: result.error,
    }
  } catch (err) {
    return {
      status: "error",
      runId,
      sessionKey,
      error: err instanceof Error ? err.message : "Unknown error sending to session",
    }
  }
}

/**
 * Tool definition for Claude SDK
 */
export const sessionsSendToolDefinition = {
  name: "sessions_send",
  description: `Send a message to another chat session.

This triggers an agent run in the target session with your message.
The target agent will see context about who sent the message.

Use cases:
- Delegate a subtask to a specialized session
- Request information from another workspace
- Coordinate between multiple agents

By default, waits up to 30 seconds for a response.
Set timeoutSeconds: 0 for fire-and-forget (async) messaging.`,
  input_schema: {
    type: "object" as const,
    properties: {
      sessionKey: {
        type: "string",
        description: "Target session key (from sessions_list)",
      },
      message: {
        type: "string",
        description: "Message to send to the target session",
      },
      timeoutSeconds: {
        type: "number",
        description: "How long to wait for response (0 = fire-and-forget, default: 30, max: 300)",
      },
      waitForReply: {
        type: "boolean",
        description: "Whether to wait for and return the response (default: true)",
      },
    },
    required: ["sessionKey", "message"],
  },
}
