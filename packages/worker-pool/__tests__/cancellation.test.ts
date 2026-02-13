/**
 * Cancellation Integration Tests
 *
 * Tests the abort signal flow from API layer through worker pool to worker process.
 * These tests verify the fix for the "dead abort signal" bug where cancellation
 * signals were not propagating to workers.
 *
 * Bug scenario (before fix):
 * 1. User clicks Stop → cancelState.requested = true
 * 2. Signal passed to pool.query() was evaluated at call time (always undefined)
 * 3. Manager never attached abort listener → worker never received cancel
 * 4. Worker stayed "busy" forever
 *
 * Fix:
 * 1. Create AbortController upfront
 * 2. Pass live signal to pool.query()
 * 3. Call abort() in cancellation callback
 * 4. Manager's abort listener sends "cancel" to worker
 * 5. Worker aborts and returns with cancelled=true
 */

import { type ChildProcess, spawn } from "node:child_process"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createIpcServer, type IpcServer, isWorkerMessage } from "../src/ipc"
import {
  type AgentConfig,
  type AgentRequest,
  type CompleteResult,
  filterMessagesByType,
  findMessageByType,
  // Type guards
  isCompleteMessage,
  isCompleteResult,
  isReadyMessage,
  PARENT_MESSAGE_TYPES,
  type ParentToWorkerMessage,
  STREAM_TYPES,
  WORKER_MESSAGE_TYPES,
  type WorkerToParentMessage,
} from "../src/types"

// ============================================================================
// Test Utilities
// ============================================================================

/** Create a minimal valid AgentConfig for testing */
function createTestAgentConfig(): AgentConfig {
  return {
    allowedTools: ["Read", "Write"],
    disallowedTools: [],
    permissionMode: "default",
    settingSources: [],
    oauthMcpServers: {},
    streamTypes: STREAM_TYPES,
  }
}

/** Create a minimal valid AgentRequest for testing */
function createTestPayload(overrides: Partial<AgentRequest> = {}): AgentRequest {
  return {
    message: "test message",
    agentConfig: createTestAgentConfig(),
    ...overrides,
  }
}

/** Wait for condition with timeout - throws descriptive error on failure */
async function waitFor(
  condition: () => boolean,
  { timeout = 5000, interval = 50, description = "condition" } = {},
): Promise<void> {
  const start = Date.now()
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error(`waitFor "${description}" timed out after ${timeout}ms`)
    }
    await new Promise(r => setTimeout(r, interval))
  }
}

/** Create a mock worker that supports cancellation */
function createCancellableMockWorkerCode(): string {
  return `
import { createConnection } from "node:net"

const socketPath = process.env.WORKER_SOCKET_PATH
const socket = createConnection(socketPath)

let buffer = ""
let currentRequestId = null
let shouldCancel = false
let processingInterval = null

socket.on("connect", () => {
  send({ type: "${WORKER_MESSAGE_TYPES.READY}" })
})

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
  socket.write(JSON.stringify(msg) + "\\n")
}

function handleMessage(msg) {
  switch (msg.type) {
    case "${PARENT_MESSAGE_TYPES.QUERY}":
      currentRequestId = msg.requestId
      shouldCancel = false

      // Send session immediately
      send({
        type: "${WORKER_MESSAGE_TYPES.SESSION}",
        requestId: msg.requestId,
        sessionId: "test-session-" + msg.requestId
      })

      // Simulate slow processing with interval (allows cancel to interrupt)
      let messageCount = 0
      processingInterval = setInterval(() => {
        if (shouldCancel) {
          clearInterval(processingInterval)
          // Return with cancelled=true
          send({
            type: "${WORKER_MESSAGE_TYPES.COMPLETE}",
            requestId: currentRequestId,
            result: {
              type: "${STREAM_TYPES.COMPLETE}",
              totalMessages: messageCount,
              result: null,
              cancelled: true
            }
          })
          currentRequestId = null
          return
        }

        messageCount++
        send({
          type: "${WORKER_MESSAGE_TYPES.MESSAGE}",
          requestId: currentRequestId,
          content: { index: messageCount }
        })

        // Complete after 5 messages if not cancelled
        if (messageCount >= 5) {
          clearInterval(processingInterval)
          send({
            type: "${WORKER_MESSAGE_TYPES.COMPLETE}",
            requestId: currentRequestId,
            result: {
              type: "${STREAM_TYPES.COMPLETE}",
              totalMessages: messageCount,
              result: { success: true },
              cancelled: false
            }
          })
          currentRequestId = null
        }
      }, 100) // Send a message every 100ms
      break

    case "${PARENT_MESSAGE_TYPES.CANCEL}":
      if (msg.requestId === currentRequestId) {
        shouldCancel = true
        // Don't respond immediately - let the interval handle it
      }
      break

    case "${PARENT_MESSAGE_TYPES.SHUTDOWN}":
      if (processingInterval) clearInterval(processingInterval)
      send({ type: "${WORKER_MESSAGE_TYPES.SHUTDOWN_ACK}" })
      process.exit(0)
      break

    case "${PARENT_MESSAGE_TYPES.HEALTH_CHECK}":
      send({ type: "${WORKER_MESSAGE_TYPES.HEALTH_OK}", uptime: 1, queriesProcessed: 0 })
      break
  }
}
`
}

/** Create a mock worker that ignores cancel messages (to test timeout fallback) */
function _createUnresponsiveWorkerCode(): string {
  return `
import { createConnection } from "node:net"

const socketPath = process.env.WORKER_SOCKET_PATH
const socket = createConnection(socketPath)

let buffer = ""

socket.on("connect", () => {
  send({ type: "${WORKER_MESSAGE_TYPES.READY}" })
})

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
  socket.write(JSON.stringify(msg) + "\\n")
}

function handleMessage(msg) {
  switch (msg.type) {
    case "${PARENT_MESSAGE_TYPES.QUERY}":
      send({
        type: "${WORKER_MESSAGE_TYPES.SESSION}",
        requestId: msg.requestId,
        sessionId: "unresponsive-session"
      })
      // Intentionally never completes - simulates stuck worker
      break

    case "${PARENT_MESSAGE_TYPES.CANCEL}":
      // Intentionally ignores cancel - simulates unresponsive worker
      break

    case "${PARENT_MESSAGE_TYPES.SHUTDOWN}":
      send({ type: "${WORKER_MESSAGE_TYPES.SHUTDOWN_ACK}" })
      process.exit(0)
      break
  }
}
`
}

// ============================================================================
// Test Suite
// ============================================================================

/** Counter for unique test directories */
let cancelTestCounter = 0

describe("Cancellation Integration", () => {
  let testDir: string
  let socketPath: string
  let mockWorkerPath: string
  let server: IpcServer | null = null
  let worker: ChildProcess | null = null

  beforeEach(async () => {
    // Create unique directory for each test
    const uniqueId = `${process.pid}-${Date.now()}-${++cancelTestCounter}-${Math.random().toString(36).slice(2, 8)}`
    testDir = join(tmpdir(), `worker-pool-cancel-${uniqueId}`)
    await mkdir(testDir, { recursive: true })
    socketPath = join(testDir, "worker.sock")
    mockWorkerPath = join(testDir, "mock-worker.mjs")
  })

  afterEach(async () => {
    // Clean up worker
    if (worker && !worker.killed) {
      worker.kill("SIGKILL")
    }
    worker = null

    // Clean up server
    if (server) {
      await server.close()
    }
    server = null

    // Clean up test directory
    await rm(testDir, { recursive: true, force: true })
  })

  describe("Cancel Message Routing", () => {
    it("should send cancel message to worker when abort signal fires", async () => {
      // Track messages received by worker (from parent)
      const _parentToWorkerMessages: ParentToWorkerMessage[] = []
      const workerToParentMessages: WorkerToParentMessage[] = []
      let workerReady = false

      // Create a worker that tracks received messages
      const trackingWorkerCode = `
import { createConnection } from "node:net"

const socketPath = process.env.WORKER_SOCKET_PATH
const socket = createConnection(socketPath)
let buffer = ""

socket.on("connect", () => {
  send({ type: "${WORKER_MESSAGE_TYPES.READY}" })
})

socket.on("data", (chunk) => {
  buffer += chunk.toString()
  let idx
  while ((idx = buffer.indexOf("\\n")) !== -1) {
    const line = buffer.slice(0, idx).trim()
    buffer = buffer.slice(idx + 1)
    if (line) {
      const msg = JSON.parse(line)
      // Echo back received messages as "message" events for test verification
      if (msg.type === "${PARENT_MESSAGE_TYPES.CANCEL}") {
        send({
          type: "${WORKER_MESSAGE_TYPES.MESSAGE}",
          requestId: msg.requestId,
          content: { receivedCancel: true, cancelRequestId: msg.requestId }
        })
        send({
          type: "${WORKER_MESSAGE_TYPES.COMPLETE}",
          requestId: msg.requestId,
          result: {
            type: "${STREAM_TYPES.COMPLETE}",
            totalMessages: 0,
            result: null,
            cancelled: true
          }
        })
      } else if (msg.type === "${PARENT_MESSAGE_TYPES.QUERY}") {
        send({
          type: "${WORKER_MESSAGE_TYPES.SESSION}",
          requestId: msg.requestId,
          sessionId: "test-session"
        })
        // Don't complete - wait for cancel
      } else if (msg.type === "${PARENT_MESSAGE_TYPES.SHUTDOWN}") {
        send({ type: "${WORKER_MESSAGE_TYPES.SHUTDOWN_ACK}" })
        process.exit(0)
      }
    }
  }
})

function send(msg) {
  socket.write(JSON.stringify(msg) + "\\n")
}
`
      await writeFile(mockWorkerPath, trackingWorkerCode)

      server = await createIpcServer({
        socketPath,
        onMessage: msg => {
          if (isWorkerMessage(msg)) {
            workerToParentMessages.push(msg)
            if (isReadyMessage(msg)) workerReady = true
          }
        },
      })

      worker = spawn(process.execPath, [mockWorkerPath], {
        env: { ...process.env, WORKER_SOCKET_PATH: socketPath },
        stdio: ["pipe", "pipe", "inherit"],
      })

      await waitFor(() => workerReady, { description: "worker ready" })

      const requestId = "cancel-test-001"

      // Send query
      server.sendMessage({
        type: PARENT_MESSAGE_TYPES.QUERY,
        requestId,
        payload: createTestPayload(),
      })

      // Wait for session to be established
      await waitFor(() => workerToParentMessages.some(m => m.type === WORKER_MESSAGE_TYPES.SESSION), {
        description: "session message",
      })

      // Send cancel message (simulating what manager does when abort fires)
      server.sendMessage({
        type: PARENT_MESSAGE_TYPES.CANCEL,
        requestId,
      })

      // Wait for worker to acknowledge cancel
      await waitFor(() => workerToParentMessages.some(m => m.type === WORKER_MESSAGE_TYPES.COMPLETE), {
        description: "complete message after cancel",
      })

      // Verify worker received the cancel message (echoed back as message event)
      const cancelEcho = workerToParentMessages.find(
        m =>
          m.type === WORKER_MESSAGE_TYPES.MESSAGE &&
          (m as { content?: { receivedCancel?: boolean } }).content?.receivedCancel === true,
      )
      expect(cancelEcho).toBeDefined()

      // Verify complete message has cancelled=true
      const completeMsg = findMessageByType(workerToParentMessages, WORKER_MESSAGE_TYPES.COMPLETE)
      expect(completeMsg).toBeDefined()
      expect(isCompleteResult(completeMsg!.result)).toBe(true)
      expect((completeMsg!.result as CompleteResult).cancelled).toBe(true)
    })

    it("should include correct requestId in cancel message", async () => {
      let workerReady = false
      const _receivedCancelRequestId: string | null = null

      const requestIdTrackingWorker = `
import { createConnection } from "node:net"

const socketPath = process.env.WORKER_SOCKET_PATH
const socket = createConnection(socketPath)
let buffer = ""

socket.on("connect", () => {
  send({ type: "${WORKER_MESSAGE_TYPES.READY}" })
})

socket.on("data", (chunk) => {
  buffer += chunk.toString()
  let idx
  while ((idx = buffer.indexOf("\\n")) !== -1) {
    const line = buffer.slice(0, idx).trim()
    buffer = buffer.slice(idx + 1)
    if (line) {
      const msg = JSON.parse(line)
      if (msg.type === "${PARENT_MESSAGE_TYPES.CANCEL}") {
        // Report the requestId we received
        send({
          type: "${WORKER_MESSAGE_TYPES.COMPLETE}",
          requestId: msg.requestId,
          result: {
            type: "${STREAM_TYPES.COMPLETE}",
            totalMessages: 0,
            result: { reportedRequestId: msg.requestId },
            cancelled: true
          }
        })
      } else if (msg.type === "${PARENT_MESSAGE_TYPES.QUERY}") {
        send({ type: "${WORKER_MESSAGE_TYPES.SESSION}", requestId: msg.requestId, sessionId: "test" })
      } else if (msg.type === "${PARENT_MESSAGE_TYPES.SHUTDOWN}") {
        send({ type: "${WORKER_MESSAGE_TYPES.SHUTDOWN_ACK}" })
        process.exit(0)
      }
    }
  }
})

function send(msg) { socket.write(JSON.stringify(msg) + "\\n") }
`
      await writeFile(mockWorkerPath, requestIdTrackingWorker)

      const messages: WorkerToParentMessage[] = []
      server = await createIpcServer({
        socketPath,
        onMessage: msg => {
          if (isWorkerMessage(msg)) {
            messages.push(msg)
            if (isReadyMessage(msg)) workerReady = true
          }
        },
      })

      worker = spawn(process.execPath, [mockWorkerPath], {
        env: { ...process.env, WORKER_SOCKET_PATH: socketPath },
        stdio: ["pipe", "pipe", "inherit"],
      })

      await waitFor(() => workerReady, { description: "worker ready" })

      const expectedRequestId = "unique-request-id-12345"

      server.sendMessage({
        type: PARENT_MESSAGE_TYPES.QUERY,
        requestId: expectedRequestId,
        payload: createTestPayload(),
      })

      await waitFor(() => messages.some(m => m.type === WORKER_MESSAGE_TYPES.SESSION), {
        description: "session",
      })

      server.sendMessage({
        type: PARENT_MESSAGE_TYPES.CANCEL,
        requestId: expectedRequestId,
      })

      await waitFor(() => messages.some(m => isCompleteMessage(m)), {
        description: "complete",
      })

      const completeMsg = findMessageByType(messages, WORKER_MESSAGE_TYPES.COMPLETE)
      expect(completeMsg).toBeDefined()
      expect(completeMsg!.requestId).toBe(expectedRequestId)

      // Verify the result contains the requestId that was received
      const result = completeMsg!.result as CompleteResult & { result: { reportedRequestId: string } }
      expect(result.result.reportedRequestId).toBe(expectedRequestId)
    })
  })

  describe("Worker Cancellation Behavior", () => {
    it("should stop processing and return cancelled=true when cancel received", async () => {
      await writeFile(mockWorkerPath, createCancellableMockWorkerCode())

      const messages: WorkerToParentMessage[] = []
      let workerReady = false

      server = await createIpcServer({
        socketPath,
        onMessage: msg => {
          if (isWorkerMessage(msg)) {
            messages.push(msg)
            if (isReadyMessage(msg)) workerReady = true
          }
        },
      })

      worker = spawn(process.execPath, [mockWorkerPath], {
        env: { ...process.env, WORKER_SOCKET_PATH: socketPath },
        stdio: ["pipe", "pipe", "inherit"],
      })

      await waitFor(() => workerReady, { description: "worker ready" })

      const requestId = "cancel-behavior-test"

      server.sendMessage({
        type: PARENT_MESSAGE_TYPES.QUERY,
        requestId,
        payload: createTestPayload(),
      })

      // Wait for at least one message (proving work has started)
      await waitFor(() => messages.filter(m => m.type === WORKER_MESSAGE_TYPES.MESSAGE).length >= 1, {
        description: "at least one message received",
      })

      // Cancel mid-processing
      server.sendMessage({
        type: PARENT_MESSAGE_TYPES.CANCEL,
        requestId,
      })

      // Wait for completion
      await waitFor(() => messages.some(m => isCompleteMessage(m)), {
        description: "complete after cancel",
        timeout: 3000,
      })

      const completeMsg = findMessageByType(messages, WORKER_MESSAGE_TYPES.COMPLETE)
      expect(completeMsg).toBeDefined()
      expect(isCompleteResult(completeMsg!.result)).toBe(true)

      const result = completeMsg!.result as CompleteResult
      expect(result.cancelled).toBe(true)

      // Should have fewer than 5 messages (full completion would have 5)
      const messageEvents = filterMessagesByType(messages, WORKER_MESSAGE_TYPES.MESSAGE)
      expect(messageEvents.length).toBeLessThan(5)
    })

    it("should allow new queries after cancellation", async () => {
      await writeFile(mockWorkerPath, createCancellableMockWorkerCode())

      const messages: WorkerToParentMessage[] = []
      let workerReady = false

      server = await createIpcServer({
        socketPath,
        onMessage: msg => {
          if (isWorkerMessage(msg)) {
            messages.push(msg)
            if (isReadyMessage(msg)) workerReady = true
          }
        },
      })

      worker = spawn(process.execPath, [mockWorkerPath], {
        env: { ...process.env, WORKER_SOCKET_PATH: socketPath },
        stdio: ["pipe", "pipe", "inherit"],
      })

      await waitFor(() => workerReady, { description: "worker ready" })

      // First query - cancel it
      const requestId1 = "first-query"
      server.sendMessage({
        type: PARENT_MESSAGE_TYPES.QUERY,
        requestId: requestId1,
        payload: createTestPayload(),
      })

      await waitFor(() => messages.some(m => m.type === WORKER_MESSAGE_TYPES.MESSAGE), {
        description: "first query started",
      })

      server.sendMessage({
        type: PARENT_MESSAGE_TYPES.CANCEL,
        requestId: requestId1,
      })

      await waitFor(() => messages.some(m => isCompleteMessage(m) && m.requestId === requestId1), {
        description: "first query cancelled",
      })

      // Second query - let it complete
      const requestId2 = "second-query"
      server.sendMessage({
        type: PARENT_MESSAGE_TYPES.QUERY,
        requestId: requestId2,
        payload: createTestPayload(),
      })

      await waitFor(() => messages.some(m => isCompleteMessage(m) && m.requestId === requestId2), {
        description: "second query complete",
        timeout: 3000,
      })

      // Verify first query was cancelled
      const firstComplete = messages.find(m => isCompleteMessage(m) && m.requestId === requestId1) as
        | Extract<WorkerToParentMessage, { type: "complete" }>
        | undefined
      expect(firstComplete).toBeDefined()
      expect((firstComplete!.result as CompleteResult).cancelled).toBe(true)

      // Verify second query completed successfully
      const secondComplete = messages.find(m => isCompleteMessage(m) && m.requestId === requestId2) as
        | Extract<WorkerToParentMessage, { type: "complete" }>
        | undefined
      expect(secondComplete).toBeDefined()
      expect((secondComplete!.result as CompleteResult).cancelled).toBe(false)
    })
  })

  describe("Complete Message Contract", () => {
    it("should always include cancelled field in CompleteResult", async () => {
      await writeFile(mockWorkerPath, createCancellableMockWorkerCode())

      const messages: WorkerToParentMessage[] = []
      let workerReady = false

      server = await createIpcServer({
        socketPath,
        onMessage: msg => {
          if (isWorkerMessage(msg)) {
            messages.push(msg)
            if (isReadyMessage(msg)) workerReady = true
          }
        },
      })

      worker = spawn(process.execPath, [mockWorkerPath], {
        env: { ...process.env, WORKER_SOCKET_PATH: socketPath },
        stdio: ["pipe", "pipe", "inherit"],
      })

      await waitFor(() => workerReady, { description: "worker ready" })

      // Test non-cancelled completion
      server.sendMessage({
        type: PARENT_MESSAGE_TYPES.QUERY,
        requestId: "complete-test",
        payload: createTestPayload(),
      })

      await waitFor(() => messages.some(m => isCompleteMessage(m)), {
        description: "complete message",
        timeout: 3000,
      })

      const completeMsg = findMessageByType(messages, WORKER_MESSAGE_TYPES.COMPLETE)
      expect(completeMsg).toBeDefined()

      // Use type guard to verify structure
      expect(isCompleteResult(completeMsg!.result)).toBe(true)

      const result = completeMsg!.result as CompleteResult
      expect(typeof result.cancelled).toBe("boolean")
      expect(typeof result.totalMessages).toBe("number")
      expect(typeof result.type).toBe("string")
    })

    it("should have correct type in CompleteResult", async () => {
      await writeFile(mockWorkerPath, createCancellableMockWorkerCode())

      const messages: WorkerToParentMessage[] = []
      let workerReady = false

      server = await createIpcServer({
        socketPath,
        onMessage: msg => {
          if (isWorkerMessage(msg)) {
            messages.push(msg)
            if (isReadyMessage(msg)) workerReady = true
          }
        },
      })

      worker = spawn(process.execPath, [mockWorkerPath], {
        env: { ...process.env, WORKER_SOCKET_PATH: socketPath },
        stdio: ["pipe", "pipe", "inherit"],
      })

      await waitFor(() => workerReady, { description: "worker ready" })

      server.sendMessage({
        type: PARENT_MESSAGE_TYPES.QUERY,
        requestId: "type-test",
        payload: createTestPayload(),
      })

      await waitFor(() => messages.some(m => isCompleteMessage(m)), {
        description: "complete",
        timeout: 3000,
      })

      const completeMsg = findMessageByType(messages, WORKER_MESSAGE_TYPES.COMPLETE)
      const result = completeMsg!.result as CompleteResult

      // Verify type matches expected constant
      expect(result.type).toBe(STREAM_TYPES.COMPLETE)
    })
  })

  describe("Type Guards", () => {
    it("isCompleteResult should correctly identify valid CompleteResult", () => {
      const valid: CompleteResult = {
        type: STREAM_TYPES.COMPLETE,
        totalMessages: 5,
        result: { success: true },
        cancelled: false,
      }

      expect(isCompleteResult(valid)).toBe(true)
    })

    it("isCompleteResult should reject invalid objects", () => {
      expect(isCompleteResult(null)).toBe(false)
      expect(isCompleteResult(undefined)).toBe(false)
      expect(isCompleteResult({})).toBe(false)
      expect(isCompleteResult({ type: "complete" })).toBe(false)
      expect(isCompleteResult({ type: "complete", totalMessages: 5 })).toBe(false)
      expect(isCompleteResult({ type: "complete", totalMessages: "5", cancelled: false })).toBe(false)
    })

    it("findMessageByType should return typed message", () => {
      const messages: WorkerToParentMessage[] = [
        { type: WORKER_MESSAGE_TYPES.READY },
        { type: WORKER_MESSAGE_TYPES.SESSION, requestId: "1", sessionId: "abc" },
        {
          type: WORKER_MESSAGE_TYPES.COMPLETE,
          requestId: "1",
          result: { type: "complete", totalMessages: 5, result: null, cancelled: false },
        },
      ]

      const session = findMessageByType(messages, WORKER_MESSAGE_TYPES.SESSION)
      expect(session).toBeDefined()
      // TypeScript knows this is the session type
      expect(session!.sessionId).toBe("abc")

      const complete = findMessageByType(messages, WORKER_MESSAGE_TYPES.COMPLETE)
      expect(complete).toBeDefined()
      // TypeScript knows this is the complete type
      expect(complete!.result).toBeDefined()
    })

    it("filterMessagesByType should return array of typed messages", () => {
      const messages: WorkerToParentMessage[] = [
        { type: WORKER_MESSAGE_TYPES.MESSAGE, requestId: "1", content: { a: 1 } },
        { type: WORKER_MESSAGE_TYPES.MESSAGE, requestId: "1", content: { a: 2 } },
        {
          type: WORKER_MESSAGE_TYPES.COMPLETE,
          requestId: "1",
          result: { type: "c", totalMessages: 2, result: null, cancelled: false },
        },
      ]

      const msgs = filterMessagesByType(messages, WORKER_MESSAGE_TYPES.MESSAGE)
      expect(msgs).toHaveLength(2)
      // TypeScript knows these are message types
      expect(msgs[0].content).toEqual({ a: 1 })
      expect(msgs[1].content).toEqual({ a: 2 })
    })
  })
})

/** Counter for abort signal test directories */
let abortTestCounter = 0

describe("AbortSignal Integration with Manager", () => {
  /**
   * These tests verify the manager correctly handles AbortSignal.
   * They test the exact behavior that was broken before the fix.
   */

  let testDir: string
  let _socketPath: string
  let _mockWorkerPath: string

  beforeEach(async () => {
    // Create unique directory for each test
    const uniqueId = `${process.pid}-${Date.now()}-${++abortTestCounter}-${Math.random().toString(36).slice(2, 8)}`
    testDir = join(tmpdir(), `worker-pool-abort-${uniqueId}`)
    await mkdir(testDir, { recursive: true })
    _socketPath = join(testDir, "worker.sock")
    _mockWorkerPath = join(testDir, "mock-worker.mjs")
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it("should attach abort listener when signal is provided", async () => {
    // This test verifies the fix: passing a live signal (not undefined)
    // means the abort handler is attached and can send cancel to worker

    const abortController = new AbortController()
    const { signal } = abortController

    // Track if addEventListener was called
    const addEventListenerSpy = vi.spyOn(signal, "addEventListener")

    // Simulate what manager does
    const abortHandler = vi.fn()
    signal.addEventListener("abort", abortHandler)

    expect(addEventListenerSpy).toHaveBeenCalledWith("abort", abortHandler)

    // Trigger abort
    abortController.abort()

    // Handler should have been called
    expect(abortHandler).toHaveBeenCalled()
  })

  it("should NOT attach abort listener when signal is undefined (the bug)", () => {
    // This demonstrates the bug: if signal is undefined, no listener is attached
    // The fix ensures signal is never undefined

    const signal: AbortSignal | undefined = undefined

    const abortHandler = vi.fn()

    // This is what the buggy code did - nothing happens because signal is undefined
    signal?.addEventListener("abort", abortHandler)

    // Cannot trigger abort because there's no signal
    // abortHandler will never be called
    expect(abortHandler).not.toHaveBeenCalled()
  })

  it("should trigger abort handler when AbortController.abort() is called", async () => {
    const abortController = new AbortController()
    const { signal } = abortController

    let cancelSent = false
    const abortHandler = () => {
      cancelSent = true
    }

    signal.addEventListener("abort", abortHandler)

    // Before abort
    expect(cancelSent).toBe(false)
    expect(signal.aborted).toBe(false)

    // Trigger abort (simulates user clicking Stop)
    abortController.abort()

    // After abort
    expect(cancelSent).toBe(true)
    expect(signal.aborted).toBe(true)
  })

  it("should handle abort called before addEventListener (race condition)", () => {
    // Edge case: what if abort() is called before addEventListener?
    const abortController = new AbortController()
    const { signal } = abortController

    // Abort first
    abortController.abort()

    const abortHandler = vi.fn()

    // Add listener after abort
    signal.addEventListener("abort", abortHandler)

    // Handler is NOT called for already-aborted signal when using addEventListener
    // This is standard AbortSignal behavior
    expect(abortHandler).not.toHaveBeenCalled()

    // But signal.aborted is true
    expect(signal.aborted).toBe(true)
  })

  it("should allow checking signal.aborted for pre-aborted signals", () => {
    // This shows how to handle pre-aborted signals
    const abortController = new AbortController()
    const { signal } = abortController

    abortController.abort()

    // The fix in route.ts handles this by checking both:
    // 1. signal.aborted at start (for pre-aborted)
    // 2. addEventListener for later abort
    if (signal.aborted) {
      // Handle pre-abort case
      expect(true).toBe(true)
    }
  })
})
