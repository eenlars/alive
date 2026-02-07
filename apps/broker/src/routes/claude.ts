/**
 * Claude Streaming Route
 *
 * POST /v1/streams/claude
 *
 * Receives stream requests from Next.js and manages the Claude SDK lifecycle.
 * Returns NDJSON stream of StreamEvents.
 */

import { statSync } from "node:fs"
import { getWorkerPool, type WorkerToParentMessage } from "@webalive/worker-pool"
import { Hono } from "hono"
import { stream } from "hono/streaming"
import { getStreamManager } from "../engine/stream-manager.js"
import { STREAM_EVENT_TYPES, type StartStreamRequest, StartStreamRequestSchema, type StreamEvent } from "../types.js"

const app = new Hono()

// Internal auth middleware - verify shared secret
app.use("*", async (c, next) => {
  const token = c.req.header("X-Broker-Secret")
  const expected = process.env.BROKER_SHARED_SECRET

  if (!expected) {
    console.error("[Broker] BROKER_SHARED_SECRET not configured")
    return c.json({ error: "Broker not configured" }, 500)
  }

  if (token !== expected) {
    return c.json({ error: "Unauthorized" }, 401)
  }

  await next()
})

/**
 * Start a new Claude stream
 *
 * Expects JSON body with StartStreamRequest shape.
 * Returns NDJSON stream of BridgeEvents.
 */
app.post("/", async c => {
  const startTime = Date.now()
  const timing = (label: string) =>
    console.error(`[Broker ${body?.requestId ?? "?"}] ${label}: +${Date.now() - startTime}ms`)

  // Parse and validate request
  let body: StartStreamRequest
  try {
    const raw = await c.req.json()
    const result = StartStreamRequestSchema.safeParse(raw)
    if (!result.success) {
      return c.json({ error: "Invalid request", issues: result.error.issues }, 400)
    }
    body = result.data
  } catch (_err) {
    return c.json({ error: "Invalid JSON" }, 400)
  }

  timing("request_parsed")

  const { requestId, userId, orgId, workspace, tabId } = body

  // Check concurrency limits
  const streamManager = getStreamManager()
  const check = streamManager.canAccept(orgId, userId)
  if (!check.allowed) {
    console.error(`[Broker ${requestId}] Rejected: ${check.reason}`)
    return c.json({ error: check.reason, code: "RATE_LIMITED" }, 429)
  }

  // Create stream handle with state machine
  const handle = streamManager.createStream(
    { requestId, userId, orgId, workspace, tabId },
    { timeoutMs: 300_000 }, // 5 minute timeout
  )

  if (!handle) {
    return c.json({ error: "Failed to create stream" }, 500)
  }

  const { machine, abortController } = handle
  machine.start()

  timing("stream_created")

  // Get workspace path and credentials
  // Note: In production, this would validate workspace path against a registry
  const cwd = `/srv/webalive/sites/${workspace}`
  let credentials: { uid: number; gid: number; cwd: string; workspaceKey: string }

  try {
    const st = statSync(cwd)
    credentials = {
      uid: st.uid,
      gid: st.gid,
      cwd,
      workspaceKey: workspace,
    }
  } catch (_err) {
    machine.fail(`Workspace not found: ${workspace}`)
    return c.json({ error: "Workspace not found" }, 404)
  }

  // Return NDJSON stream
  return stream(c, async streamWriter => {
    const encoder = new TextEncoder()

    // Helper to emit NDJSON events
    const emit = (event: StreamEvent) => {
      const line = `${JSON.stringify(event)}\n`
      streamWriter.write(encoder.encode(line))
      machine.recordMessage()
    }

    // Emit start event
    emit({
      type: STREAM_EVENT_TYPES.START,
      requestId,
      tabId,
      timestamp: Date.now(),
    })

    try {
      const pool = getWorkerPool()
      timing("worker_pool_acquired")

      await pool.query(credentials, {
        requestId,
        payload: {
          message: body.message,
          model: body.model ?? "claude-sonnet-4-20250514",
          maxTurns: 20,
          resume: body.sessionId,
          systemPrompt: body.systemPrompt,
          apiKey: body.apiKey,
          // AgentConfig is passed through from Next.js - worker-pool validates the shape
          agentConfig: body.agentConfig as unknown as import("@webalive/worker-pool").AgentConfig,
          sessionCookie: body.sessionCookie,
          oauthTokens: body.oauthTokens,
          userEnvKeys: body.userEnvKeys,
        },
        onMessage: (msg: WorkerToParentMessage) => {
          if (msg.type === "message" && "content" in msg) {
            emit({
              type: STREAM_EVENT_TYPES.MESSAGE,
              requestId,
              tabId,
              timestamp: Date.now(),
              data: msg.content,
            })
          } else if (msg.type === "session" && "sessionId" in msg) {
            emit({
              type: STREAM_EVENT_TYPES.SESSION,
              requestId,
              tabId,
              timestamp: Date.now(),
              sessionId: msg.sessionId,
            })
          } else if (msg.type === "complete" && "result" in msg) {
            emit({
              type: STREAM_EVENT_TYPES.COMPLETE,
              requestId,
              tabId,
              timestamp: Date.now(),
              result: msg.result,
            })
          }
        },
        signal: abortController.signal,
      })

      // Stream completed successfully
      machine.complete()
      timing("stream_complete")
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error"

      if (abortController.signal.aborted) {
        // Cancelled by user
        machine.cancel()
        emit({
          type: STREAM_EVENT_TYPES.INTERRUPT,
          requestId,
          tabId,
          timestamp: Date.now(),
          reason: "cancelled",
        })
      } else {
        // Actual error
        machine.fail(errorMessage)
        emit({
          type: STREAM_EVENT_TYPES.ERROR,
          requestId,
          tabId,
          timestamp: Date.now(),
          error: errorMessage,
        })
      }

      timing("stream_error")
    }
  })
})

/**
 * Cancel an active stream
 */
app.post("/:requestId/cancel", async c => {
  const { requestId } = c.req.param()
  const streamManager = getStreamManager()

  const cancelled = streamManager.cancelStream(requestId)
  if (!cancelled) {
    return c.json({ error: "Stream not found or already finished" }, 404)
  }

  return c.json({ success: true })
})

export default app
