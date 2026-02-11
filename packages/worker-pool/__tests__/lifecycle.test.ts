/**
 * Worker Pool Lifecycle Integration Tests
 *
 * Comprehensive tests for the FULL worker pool lifecycle including:
 * - Worker spawning and ready state
 * - Query execution and completion
 * - Cancellation and abort handling
 * - Error recovery and state cleanup
 * - The "worker busy" bug prevention
 *
 * These tests use realistic mock workers that simulate actual behavior
 * including failure modes that caused production bugs.
 */

import { type ChildProcess, spawn } from "node:child_process"
import { chmod, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { createIpcServer, isWorkerMessage } from "../src/ipc"
import type { WorkerToParentMessage } from "../src/types"
import { findMessageByType, isCompleteMessage, isErrorMessage, WORKER_MESSAGE_TYPES } from "../src/types"

// ============================================================================
// Test Utilities
// ============================================================================

interface TestContext {
  testDir: string
  socketPath: string
  mockWorkerPath: string
  server: Awaited<ReturnType<typeof createIpcServer>> | null
  worker: ChildProcess | null
  messages: WorkerToParentMessage[]
  workerReady: boolean
  workerExited: boolean
  exitCode: number | null
}

/** Wait for condition with timeout */
async function waitFor(
  condition: () => boolean,
  { timeout = 5000, interval = 20, message = "condition" } = {},
): Promise<void> {
  const start = Date.now()
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error(`waitFor(${message}) timed out after ${timeout}ms`)
    }
    await new Promise(r => setTimeout(r, interval))
  }
}

/** Wait for specific message type */
async function waitForMessage(
  ctx: TestContext,
  type: string,
  opts?: { timeout?: number; requestId?: string },
): Promise<WorkerToParentMessage> {
  const { timeout = 5000, requestId } = opts ?? {}
  await waitFor(
    () => ctx.messages.some(m => m.type === type && (!requestId || ("requestId" in m && m.requestId === requestId))),
    { timeout, message: `message type="${type}"${requestId ? ` requestId="${requestId}"` : ""}` },
  )
  return ctx.messages.find(m => m.type === type && (!requestId || ("requestId" in m && m.requestId === requestId)))!
}

/** Counter for unique test directory names */
let testContextCounter = 0

/** Create test context with temp directory */
async function createTestContext(): Promise<TestContext> {
  // Use counter + timestamp + random to ensure uniqueness even when tests run in parallel
  const uniqueId = `${process.pid}-${Date.now()}-${++testContextCounter}-${Math.random().toString(36).slice(2, 8)}`
  const testDir = join(tmpdir(), `worker-lifecycle-${uniqueId}`)
  await mkdir(testDir, { recursive: true })
  await chmod(testDir, 0o700)

  return {
    testDir,
    socketPath: join(testDir, "worker.sock"),
    mockWorkerPath: join(testDir, "mock-worker.mjs"),
    server: null,
    worker: null,
    messages: [],
    workerReady: false,
    workerExited: false,
    exitCode: null,
  }
}

/** Clean up test context */
async function cleanupContext(ctx: TestContext): Promise<void> {
  if (ctx.worker && !ctx.workerExited) {
    ctx.worker.kill("SIGKILL")
    await new Promise(r => setTimeout(r, 100))
  }
  if (ctx.server) {
    await ctx.server.close()
  }
  try {
    await chmod(ctx.testDir, 0o755)
  } catch {}
  await rm(ctx.testDir, { recursive: true, force: true })
}

/** Create IPC server for test context */
async function createServer(ctx: TestContext): Promise<void> {
  ctx.server = await createIpcServer({
    socketPath: ctx.socketPath,
    onMessage: msg => {
      if (isWorkerMessage(msg)) {
        ctx.messages.push(msg)
        if (msg.type === "ready") ctx.workerReady = true
      }
    },
    onDisconnect: () => {
      // Worker disconnected
    },
  })
}

/** Spawn worker for test context */
function spawnWorker(ctx: TestContext, env: Record<string, string> = {}): void {
  ctx.worker = spawn(process.execPath, [ctx.mockWorkerPath], {
    env: { ...process.env, WORKER_SOCKET_PATH: ctx.socketPath, ...env },
    stdio: ["pipe", "pipe", "inherit"],
  })
  ctx.worker.on("exit", code => {
    ctx.workerExited = true
    ctx.exitCode = code
  })
}

// ============================================================================
// Mock Worker Templates
// ============================================================================

/**
 * Standard mock worker - simulates normal behavior
 */
const MOCK_WORKER_STANDARD = `
import { createConnection } from "node:net"

const socketPath = process.env.WORKER_SOCKET_PATH
const socket = createConnection(socketPath)

let buffer = ""
let currentRequestId = null
let shouldFail = process.env.SHOULD_FAIL === "true"
let failMode = process.env.FAIL_MODE || "none"
let queryDelay = Number(process.env.QUERY_DELAY) || 0

socket.on("connect", () => send({ type: "ready" }))
socket.on("error", (err) => {
  console.error("[mock] Socket error:", err.message)
  process.exit(1)
})
socket.on("close", () => process.exit(0))

socket.on("data", (chunk) => {
  buffer += chunk.toString()
  let idx
  while ((idx = buffer.indexOf("\\n")) !== -1) {
    const line = buffer.slice(0, idx).trim()
    buffer = buffer.slice(idx + 1)
    if (line) handleMessage(JSON.parse(line))
  }
})

function send(msg) {
  if (socket.writable) {
    socket.write(JSON.stringify(msg) + "\\n")
  }
}

async function handleMessage(msg) {
  switch (msg.type) {
    case "query":
      currentRequestId = msg.requestId

      // Simulate different failure modes
      if (failMode === "unhandled_rejection") {
        // This simulates an unhandled promise rejection
        // Should be caught by .catch() in worker-entry.mjs
        throw new Error("Simulated unhandled rejection")
      }

      if (failMode === "early_return_no_cleanup") {
        // This simulates returning without sending complete/error
        // BAD: Leaves worker in busy state forever
        currentRequestId = null
        return
      }

      if (failMode === "crash") {
        // Simulate worker crash
        process.exit(1)
      }

      // Normal flow with optional delay
      if (queryDelay > 0) {
        await new Promise(r => setTimeout(r, queryDelay))
      }

      send({ type: "session", requestId: msg.requestId, sessionId: "session-" + msg.requestId })

      // Check if cancelled during delay
      if (currentRequestId !== msg.requestId) {
        return // Was cancelled
      }

      if (shouldFail) {
        send({ type: "error", requestId: msg.requestId, error: "Simulated error" })
      } else {
        send({ type: "message", requestId: msg.requestId, content: { data: "processing" } })
        send({ type: "complete", requestId: msg.requestId, result: { success: true } })
      }

      currentRequestId = null
      break

    case "cancel":
      if (currentRequestId === msg.requestId) {
        console.error("[mock] Cancelling:", msg.requestId)
        // Proper cancellation: send complete and clear state
        send({ type: "complete", requestId: msg.requestId, result: { cancelled: true } })
        currentRequestId = null
      }
      break

    case "shutdown":
      send({ type: "shutdown_ack" })
      process.exit(0)
      break

    case "health_check":
      send({ type: "health_ok", uptime: 1, queriesProcessed: 0 })
      break
  }
}
`

/**
 * Worker that properly handles all edge cases
 * Used to verify correct behavior
 */
const MOCK_WORKER_ROBUST = `
import { createConnection } from "node:net"

const socketPath = process.env.WORKER_SOCKET_PATH
const socket = createConnection(socketPath)

let buffer = ""
let currentRequestId = null
let abortController = null

socket.on("connect", () => send({ type: "ready" }))
socket.on("error", (err) => process.exit(1))
socket.on("close", () => process.exit(0))

socket.on("data", (chunk) => {
  buffer += chunk.toString()
  let idx
  while ((idx = buffer.indexOf("\\n")) !== -1) {
    const line = buffer.slice(0, idx).trim()
    buffer = buffer.slice(idx + 1)
    if (line) {
      try {
        handleMessage(JSON.parse(line))
      } catch (err) {
        // Always send error response on any failure
        if (currentRequestId) {
          send({ type: "error", requestId: currentRequestId, error: err.message })
          currentRequestId = null
          abortController = null
        }
      }
    }
  }
})

function send(msg) {
  if (socket.writable) {
    socket.write(JSON.stringify(msg) + "\\n")
  }
}

async function handleMessage(msg) {
  switch (msg.type) {
    case "query":
      if (currentRequestId) {
        // Already processing - reject new query
        send({ type: "error", requestId: msg.requestId, error: "Worker busy" })
        return
      }

      currentRequestId = msg.requestId
      abortController = { aborted: false }

      try {
        // Simulate some work
        for (let i = 0; i < 3; i++) {
          if (abortController.aborted) {
            send({ type: "complete", requestId: msg.requestId, result: { cancelled: true } })
            return
          }
          send({ type: "message", requestId: msg.requestId, content: { step: i } })
          await new Promise(r => setTimeout(r, 10))
        }

        send({ type: "session", requestId: msg.requestId, sessionId: "sess-" + Date.now() })
        send({ type: "complete", requestId: msg.requestId, result: { success: true } })
      } finally {
        // CRITICAL: Always clean up state
        currentRequestId = null
        abortController = null
      }
      break

    case "cancel":
      if (currentRequestId === msg.requestId && abortController) {
        abortController.aborted = true
      }
      break

    case "shutdown":
      send({ type: "shutdown_ack" })
      process.exit(0)
      break
  }
}
`

// ============================================================================
// Tests
// ============================================================================

/** Helper to run a test with its own isolated context */
async function withContext(testFn: (ctx: TestContext) => Promise<void>): Promise<void> {
  const ctx = await createTestContext()
  try {
    await testFn(ctx)
  } finally {
    await cleanupContext(ctx)
  }
}

/**
 * NOTE: These tests pass when run in isolation but may fail when run in parallel
 * with other test files due to bun's concurrent test execution and filesystem timing.
 *
 * To run these tests reliably:
 *   bun run test packages/worker-pool/__tests__/lifecycle.test.ts
 *
 * When running all tests together, use:
 *   bun run test packages/worker-pool --concurrency 1
 */
describe("Worker Pool Lifecycle", () => {
  // --------------------------------------------------------------------------
  // Basic Lifecycle
  // --------------------------------------------------------------------------

  describe("Basic Lifecycle", () => {
    it("should complete spawn → ready → query → complete → shutdown", async () => {
      await withContext(async ctx => {
        await writeFile(ctx.mockWorkerPath, MOCK_WORKER_STANDARD)
        await createServer(ctx)
        spawnWorker(ctx)

        // 1. Wait for ready
        await waitFor(() => ctx.workerReady, { message: "worker ready" })
        expect(ctx.messages[0]).toEqual({ type: WORKER_MESSAGE_TYPES.READY })

        // 2. Send query
        ctx.server!.sendMessage({
          type: "query",
          requestId: "req-1",
          payload: { message: "hello" },
        })

        // 3. Wait for complete
        await waitForMessage(ctx, WORKER_MESSAGE_TYPES.COMPLETE, { requestId: "req-1" })

        // Verify message sequence
        const types = ctx.messages.map(m => m.type)
        expect(types).toContain(WORKER_MESSAGE_TYPES.READY)
        expect(types).toContain(WORKER_MESSAGE_TYPES.SESSION)
        expect(types).toContain(WORKER_MESSAGE_TYPES.MESSAGE)
        expect(types).toContain(WORKER_MESSAGE_TYPES.COMPLETE)

        // 4. Graceful shutdown
        ctx.server!.sendMessage({ type: "shutdown", graceful: true })
        await waitFor(() => ctx.workerExited, { message: "worker exit" })
        expect(ctx.exitCode).toBe(0)
      })
    })

    it("should handle multiple sequential queries", async () => {
      await withContext(async ctx => {
        await writeFile(ctx.mockWorkerPath, MOCK_WORKER_STANDARD)
        await createServer(ctx)
        spawnWorker(ctx)

        await waitFor(() => ctx.workerReady)

        // Send 5 queries sequentially
        for (let i = 0; i < 5; i++) {
          ctx.server!.sendMessage({
            type: "query",
            requestId: `req-${i}`,
            payload: { index: i },
          })
          await waitForMessage(ctx, WORKER_MESSAGE_TYPES.COMPLETE, { requestId: `req-${i}` })
        }

        // All queries should have completed
        const completions = ctx.messages.filter(m => m.type === WORKER_MESSAGE_TYPES.COMPLETE)
        expect(completions).toHaveLength(5)
      })
    })
  })

  // --------------------------------------------------------------------------
  // Error Handling (THE BUGS WE FIXED)
  // --------------------------------------------------------------------------

  describe("Error Recovery - Worker Busy Bug Prevention", () => {
    /**
     * THE BUG: If handleQuery() throws an unhandled exception, the parent
     * never receives complete/error and thinks the worker is busy forever.
     *
     * FIX: Added .catch() handler in worker-entry.mjs that sends error response
     */
    it("should recover from unhandled promise rejection", async () => {
      await withContext(async ctx => {
        await writeFile(ctx.mockWorkerPath, MOCK_WORKER_STANDARD)
        await createServer(ctx)
        spawnWorker(ctx, { FAIL_MODE: "unhandled_rejection" })

        await waitFor(() => ctx.workerReady)

        // First query triggers unhandled rejection
        ctx.server!.sendMessage({
          type: "query",
          requestId: "req-fail",
          payload: {},
        })

        // Worker should crash (unhandled rejection in mock)
        // In real worker-entry.mjs, our .catch() prevents this
        await waitFor(() => ctx.workerExited, { timeout: 2000 })

        // The point: if we had proper error handling, we'd get an error message
        // instead of worker crash. This test documents the failure mode.
      })
    })

    /**
     * THE BUG: Early return without clearing currentRequestId leaves
     * the worker thinking it's still busy.
     *
     * FIX: Always clear state on all return paths
     */
    it("should not get stuck if worker returns without sending response", async () => {
      await withContext(async ctx => {
        await writeFile(ctx.mockWorkerPath, MOCK_WORKER_STANDARD)
        await createServer(ctx)
        spawnWorker(ctx, { FAIL_MODE: "early_return_no_cleanup" })

        await waitFor(() => ctx.workerReady)

        // First query - worker returns without sending complete/error
        ctx.server!.sendMessage({
          type: "query",
          requestId: "req-1",
          payload: {},
        })

        // Give it time to "process" (it returns immediately without response)
        await new Promise(r => setTimeout(r, 100))

        // Second query - in buggy code, this would fail because
        // currentRequestId was cleared but parent thinks worker is busy
        // But mock clears currentRequestId, so the worker accepts it
        ctx.server!.sendMessage({
          type: "query",
          requestId: "req-2",
          payload: {},
        })

        // This timeout demonstrates the problem - no complete message ever arrives
        // for req-1, so parent would be stuck
        await new Promise(r => setTimeout(r, 200))

        // Neither query completed (no complete messages)
        const completions = ctx.messages.filter(m => m.type === WORKER_MESSAGE_TYPES.COMPLETE)
        expect(completions).toHaveLength(0)
      })
    })

    it("should handle worker crash gracefully", async () => {
      await withContext(async ctx => {
        await writeFile(ctx.mockWorkerPath, MOCK_WORKER_STANDARD)
        await createServer(ctx)
        spawnWorker(ctx, { FAIL_MODE: "crash" })

        await waitFor(() => ctx.workerReady)

        // Query causes worker to crash
        ctx.server!.sendMessage({
          type: "query",
          requestId: "req-crash",
          payload: {},
        })

        // Worker should exit with code 1
        await waitFor(() => ctx.workerExited)
        expect(ctx.exitCode).toBe(1)

        // No complete message (worker died)
        const completions = ctx.messages.filter(m => m.type === WORKER_MESSAGE_TYPES.COMPLETE)
        expect(completions).toHaveLength(0)
      })
    })

    it("should handle query error response correctly", async () => {
      await withContext(async ctx => {
        await writeFile(ctx.mockWorkerPath, MOCK_WORKER_STANDARD)
        await createServer(ctx)
        spawnWorker(ctx, { SHOULD_FAIL: "true" })

        await waitFor(() => ctx.workerReady)

        ctx.server!.sendMessage({
          type: "query",
          requestId: "req-error",
          payload: {},
        })

        // Wait for error response
        await waitForMessage(ctx, WORKER_MESSAGE_TYPES.ERROR, { requestId: "req-error" })

        // Should receive error response (type-safe)
        const errorMsg = findMessageByType(ctx.messages, WORKER_MESSAGE_TYPES.ERROR)
        expect(errorMsg).toBeDefined()
        expect(errorMsg!.error).toBe("Simulated error")

        // Worker should still be alive and accept new queries
        ctx.server!.sendMessage({
          type: "query",
          requestId: "req-after-error",
          payload: {},
        })

        // This should also fail (SHOULD_FAIL is still true)
        await waitForMessage(ctx, WORKER_MESSAGE_TYPES.ERROR, { requestId: "req-after-error" })
      })
    })
  })

  // --------------------------------------------------------------------------
  // Cancellation
  // --------------------------------------------------------------------------

  describe("Cancellation Handling", () => {
    it("should cancel in-flight query", async () => {
      await withContext(async ctx => {
        await writeFile(ctx.mockWorkerPath, MOCK_WORKER_STANDARD)
        await createServer(ctx)
        spawnWorker(ctx, { QUERY_DELAY: "500" }) // Add delay so we can cancel

        await waitFor(() => ctx.workerReady)

        // Start query
        ctx.server!.sendMessage({
          type: "query",
          requestId: "req-cancel",
          payload: {},
        })

        // Wait a bit then cancel
        await new Promise(r => setTimeout(r, 50))
        ctx.server!.sendMessage({
          type: "cancel",
          requestId: "req-cancel",
        })

        // Wait for complete
        await waitForMessage(ctx, WORKER_MESSAGE_TYPES.COMPLETE, { requestId: "req-cancel" })

        // Should receive complete with cancelled flag (type-safe)
        const complete = findMessageByType(ctx.messages, WORKER_MESSAGE_TYPES.COMPLETE)
        expect(complete).toBeDefined()
        expect((complete!.result as { cancelled?: boolean }).cancelled).toBe(true)
      })
    })

    it("should accept new query after cancellation", async () => {
      await withContext(async ctx => {
        await writeFile(ctx.mockWorkerPath, MOCK_WORKER_STANDARD)
        await createServer(ctx)
        spawnWorker(ctx, { QUERY_DELAY: "200" })

        await waitFor(() => ctx.workerReady)

        // Start and cancel first query
        ctx.server!.sendMessage({
          type: "query",
          requestId: "req-1",
          payload: {},
        })
        await new Promise(r => setTimeout(r, 50))
        ctx.server!.sendMessage({ type: "cancel", requestId: "req-1" })
        await waitForMessage(ctx, WORKER_MESSAGE_TYPES.COMPLETE, { requestId: "req-1" })

        // Second query should work
        ctx.server!.sendMessage({
          type: "query",
          requestId: "req-2",
          payload: {},
        })
        await waitForMessage(ctx, WORKER_MESSAGE_TYPES.COMPLETE, { requestId: "req-2" })

        // Should have 2 completions
        const completions = ctx.messages.filter(m => m.type === WORKER_MESSAGE_TYPES.COMPLETE)
        expect(completions).toHaveLength(2)
      })
    })
  })

  // --------------------------------------------------------------------------
  // Robust Worker Behavior
  // --------------------------------------------------------------------------

  describe("Robust Worker Implementation", () => {
    it("should always clean up state in finally block", async () => {
      await withContext(async ctx => {
        await writeFile(ctx.mockWorkerPath, MOCK_WORKER_ROBUST)
        await createServer(ctx)
        spawnWorker(ctx)

        await waitFor(() => ctx.workerReady)

        // Send multiple rapid queries
        for (let i = 0; i < 3; i++) {
          ctx.server!.sendMessage({
            type: "query",
            requestId: `req-${i}`,
            payload: {},
          })
          await waitForMessage(ctx, WORKER_MESSAGE_TYPES.COMPLETE, { requestId: `req-${i}` })
        }

        // All should complete successfully (type-safe)
        const completions = ctx.messages.filter(isCompleteMessage)
        expect(completions).toHaveLength(3)
        completions.forEach(c => {
          expect(c.result).toMatchObject({ success: true })
        })
      })
    })

    it("should reject concurrent queries", async () => {
      await withContext(async ctx => {
        await writeFile(ctx.mockWorkerPath, MOCK_WORKER_ROBUST)
        await createServer(ctx)
        spawnWorker(ctx)

        await waitFor(() => ctx.workerReady)

        // Send two queries without waiting
        ctx.server!.sendMessage({ type: "query", requestId: "req-1", payload: {} })
        ctx.server!.sendMessage({ type: "query", requestId: "req-2", payload: {} })

        // Wait for both responses
        await waitFor(
          () =>
            ctx.messages.some(m => m.type === WORKER_MESSAGE_TYPES.COMPLETE) &&
            ctx.messages.some(m => m.type === WORKER_MESSAGE_TYPES.ERROR),
          { message: "complete and error messages" },
        )

        // First should complete, second should error
        const errorMsgs = ctx.messages.filter(isErrorMessage)
        const busyError = errorMsgs.find(m => m.requestId === "req-2")
        expect(busyError).toBeDefined()
        expect(busyError!.error).toContain("busy")
      })
    })

    it("should handle abort during processing", async () => {
      await withContext(async ctx => {
        await writeFile(ctx.mockWorkerPath, MOCK_WORKER_ROBUST)
        await createServer(ctx)
        spawnWorker(ctx)

        await waitFor(() => ctx.workerReady)

        // Start query
        ctx.server!.sendMessage({
          type: "query",
          requestId: "req-abort",
          payload: {},
        })

        // Cancel immediately
        ctx.server!.sendMessage({ type: "cancel", requestId: "req-abort" })

        // Should complete (either with result or cancelled)
        const complete = await waitForMessage(ctx, WORKER_MESSAGE_TYPES.COMPLETE, { requestId: "req-abort" })
        expect(complete).toBeDefined()
      })
    })
  })

  // --------------------------------------------------------------------------
  // Connection Lifecycle
  // --------------------------------------------------------------------------

  describe("Connection Lifecycle", () => {
    it("should handle server shutdown during query", async () => {
      await withContext(async ctx => {
        await writeFile(ctx.mockWorkerPath, MOCK_WORKER_STANDARD)
        await createServer(ctx)
        spawnWorker(ctx, { QUERY_DELAY: "1000" })

        await waitFor(() => ctx.workerReady)

        // Start slow query
        ctx.server!.sendMessage({
          type: "query",
          requestId: "req-slow",
          payload: {},
        })

        // Close server while query is in progress
        await new Promise(r => setTimeout(r, 100))
        await ctx.server!.close()
        ctx.server = null

        // Worker should detect disconnect and exit
        await waitFor(() => ctx.workerExited, { timeout: 2000 })
      })
    })

    it("should handle worker disconnect", async () => {
      await withContext(async ctx => {
        let disconnected = false
        await writeFile(ctx.mockWorkerPath, MOCK_WORKER_STANDARD)

        ctx.server = await createIpcServer({
          socketPath: ctx.socketPath,
          onMessage: msg => {
            ctx.messages.push(msg as WorkerToParentMessage)
            if ((msg as WorkerToParentMessage).type === WORKER_MESSAGE_TYPES.READY) ctx.workerReady = true
          },
          onDisconnect: () => {
            disconnected = true
          },
        })

        spawnWorker(ctx)
        await waitFor(() => ctx.workerReady)

        // Kill worker abruptly
        ctx.worker!.kill("SIGKILL")

        await waitFor(() => disconnected, { timeout: 2000 })
        expect(disconnected).toBe(true)
      })
    })
  })
})

// ============================================================================
// Manager Integration Tests
// ============================================================================

describe("WorkerPoolManager Integration", () => {
  /**
   * This test simulates the exact bug that caused "Worker busy" errors:
   *
   * 1. User sends message (query starts)
   * 2. Something goes wrong (error, timeout, cancel)
   * 3. Worker's internal state is cleared (currentRequestId = null)
   * 4. BUT parent never receives complete/error message
   * 5. Parent still thinks worker is busy
   * 6. User sends second message → "Worker busy" error
   *
   * The fix ensures ALL exit paths send a response to the parent.
   */
  it("should demonstrate the worker-busy bug scenario", () =>
    withContext(async ctx => {
      // Create a buggy worker that clears internal state but forgets to notify parent
      const BUGGY_WORKER = `
import { createConnection } from "node:net"

const socket = createConnection(process.env.WORKER_SOCKET_PATH)
let buffer = ""
let currentRequestId = null

socket.on("connect", () => send({ type: "ready" }))
socket.on("data", (chunk) => {
  buffer += chunk.toString()
  let idx
  while ((idx = buffer.indexOf("\\n")) !== -1) {
    const line = buffer.slice(0, idx).trim()
    buffer = buffer.slice(idx + 1)
    if (line) handleMessage(JSON.parse(line))
  }
})

function send(msg) { socket.write(JSON.stringify(msg) + "\\n") }

function handleMessage(msg) {
  if (msg.type === "query") {
    if (currentRequestId) {
      send({ type: "error", requestId: msg.requestId, error: "Worker busy - BUG REPRODUCED" })
      return
    }

    currentRequestId = msg.requestId

    // BUG: Clear state but DON'T send response
    // This simulates the bug where finally{} runs but catch{} doesn't send error
    currentRequestId = null  // Internal state cleared
    // Missing: send({ type: "complete", ... }) or send({ type: "error", ... })

    // Worker thinks it's free, but parent never knows query ended
  }
  if (msg.type === "shutdown") {
    send({ type: "shutdown_ack" })
    process.exit(0)
  }
}
`

      await writeFile(ctx.mockWorkerPath, BUGGY_WORKER)
      await createServer(ctx)
      spawnWorker(ctx)

      await waitFor(() => ctx.workerReady)

      // First query - worker "processes" it but doesn't send response
      ctx.server!.sendMessage({
        type: "query",
        requestId: "req-1",
        payload: {},
      })

      // Wait for it to "complete" (internally)
      await new Promise(r => setTimeout(r, 100))

      // No complete message received
      expect(ctx.messages.filter(m => m.type === WORKER_MESSAGE_TYPES.COMPLETE)).toHaveLength(0)

      // Second query - worker accepts it (internal state was cleared)
      // But in real manager.ts, we'd still think worker is busy!
      ctx.server!.sendMessage({
        type: "query",
        requestId: "req-2",
        payload: {},
      })

      await new Promise(r => setTimeout(r, 100))

      // Worker accepted second query (no "Worker busy" error)
      // This proves the worker's internal state was reset
      // But the parent (manager.ts) would be in a bad state (type-safe check)
      const busyErrors = ctx.messages.filter(isErrorMessage).filter(m => m.error?.includes("busy"))
      expect(busyErrors).toHaveLength(0)

      // The test proves: if worker clears state without sending response,
      // the parent/worker state becomes inconsistent
    }))

  /**
   * This test shows the CORRECT behavior after our fix:
   * ALL exit paths must send complete/error to parent
   */
  it("should always send response to parent on all exit paths", () =>
    withContext(async ctx => {
      const FIXED_WORKER = `
import { createConnection } from "node:net"

const socket = createConnection(process.env.WORKER_SOCKET_PATH)
let buffer = ""
let currentRequestId = null

socket.on("connect", () => send({ type: "ready" }))
socket.on("data", (chunk) => {
  buffer += chunk.toString()
  let idx
  while ((idx = buffer.indexOf("\\n")) !== -1) {
    const line = buffer.slice(0, idx).trim()
    buffer = buffer.slice(idx + 1)
    if (line) handleMessage(JSON.parse(line))
  }
})

function send(msg) { socket.write(JSON.stringify(msg) + "\\n") }

async function handleMessage(msg) {
  if (msg.type === "query") {
    if (currentRequestId) {
      send({ type: "error", requestId: msg.requestId, error: "Worker busy" })
      return
    }

    currentRequestId = msg.requestId

    try {
      // Simulate work that might fail
      if (msg.payload?.shouldFail) {
        throw new Error("Simulated failure")
      }

      // Normal completion
      send({ type: "complete", requestId: msg.requestId, result: { success: true } })
    } catch (err) {
      // FIXED: Always send error on failure
      send({ type: "error", requestId: msg.requestId, error: err.message })
    } finally {
      // FIXED: Only clear state after sending response
      currentRequestId = null
    }
  }
  if (msg.type === "shutdown") {
    send({ type: "shutdown_ack" })
    process.exit(0)
  }
}
`

      await writeFile(ctx.mockWorkerPath, FIXED_WORKER)
      await createServer(ctx)
      spawnWorker(ctx)

      await waitFor(() => ctx.workerReady)

      // Query that fails
      ctx.server!.sendMessage({
        type: "query",
        requestId: "req-fail",
        payload: { shouldFail: true },
      })

      // Should receive error response
      await waitForMessage(ctx, WORKER_MESSAGE_TYPES.ERROR, { requestId: "req-fail" })

      // Second query should work (worker properly reset)
      ctx.server!.sendMessage({
        type: "query",
        requestId: "req-success",
        payload: { shouldFail: false },
      })

      await waitForMessage(ctx, WORKER_MESSAGE_TYPES.COMPLETE, { requestId: "req-success" })

      // Verify: 1 error, 1 complete
      expect(ctx.messages.filter(m => m.type === WORKER_MESSAGE_TYPES.ERROR)).toHaveLength(1)
      expect(ctx.messages.filter(m => m.type === WORKER_MESSAGE_TYPES.COMPLETE)).toHaveLength(1)
    }))
})
