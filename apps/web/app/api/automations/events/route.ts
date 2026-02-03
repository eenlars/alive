/**
 * Automation Events SSE Endpoint
 *
 * Real-time streaming of automation events via Server-Sent Events.
 * Clients can subscribe to receive updates when jobs start, complete, or fail.
 */

import type { NextRequest } from "next/server"
import { getSessionUser } from "@/features/auth/lib/auth"

// Store connected clients per user
const clients = new Map<string, Set<ReadableStreamDefaultController>>()

// Event emitter for broadcasting events
export function broadcastAutomationEvent(
  userId: string,
  event: {
    type: "started" | "finished" | "error"
    jobId: string
    jobName?: string
    status?: string
    error?: string
    summary?: string
    durationMs?: number
    nextRunAt?: string
  },
) {
  const userClients = clients.get(userId)
  if (!userClients?.size) return

  const data = JSON.stringify(event)

  for (const controller of userClients) {
    try {
      controller.enqueue(`data: ${data}\n\n`)
    } catch {
      // Client disconnected, will be cleaned up
    }
  }
}

/**
 * GET /api/automations/events - Subscribe to automation events
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return new Response("Unauthorized", { status: 401 })
  }

  const userId = user.id

  // Set up SSE stream
  const stream = new ReadableStream({
    start(controller) {
      // Add to clients map
      if (!clients.has(userId)) {
        clients.set(userId, new Set())
      }
      clients.get(userId)!.add(controller)

      // Send initial connection message
      controller.enqueue(`data: ${JSON.stringify({ type: "connected" })}\n\n`)

      // Keep-alive ping every 30 seconds
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(": ping\n\n")
        } catch {
          clearInterval(pingInterval)
        }
      }, 30000)

      // Clean up on close
      req.signal.addEventListener("abort", () => {
        clearInterval(pingInterval)
        clients.get(userId)?.delete(controller)
        if (clients.get(userId)?.size === 0) {
          clients.delete(userId)
        }
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
