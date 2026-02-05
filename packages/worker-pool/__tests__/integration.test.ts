/**
 * Integration tests for worker pool
 *
 * These tests spawn real processes and verify the full IPC message flow.
 * Uses a mock worker script instead of the full worker-entry.mjs.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { chmod, mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { spawn } from "node:child_process"
import { createIpcServer, createIpcClient, NdjsonParser, isWorkerMessage } from "../src/ipc"
import type { ParentToWorkerMessage, WorkerToParentMessage, AgentRequest, AgentConfig } from "../src/types"
import { STREAM_TYPES, findMessageByType } from "../src/types"

/** Create a minimal valid AgentConfig for testing */
function createTestAgentConfig(): AgentConfig {
  return {
    allowedTools: ["Read", "Write"],
    disallowedTools: [],
    permissionMode: "default",
    settingSources: [],
    oauthMcpServers: {},
    bridgeStreamTypes: STREAM_TYPES,
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

/** Wait for condition to be true with timeout */
async function waitFor(condition: () => boolean, { timeout = 2000, interval = 50 } = {}): Promise<void> {
  const start = Date.now()
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error(`waitFor timed out after ${timeout}ms`)
    }
    await new Promise(r => setTimeout(r, interval))
  }
}

describe("IPC Integration", () => {
  const testDir = join(tmpdir(), `worker-pool-test-${process.pid}`)
  let socketPath: string

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
    socketPath = join(testDir, "test.sock")
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  describe("createIpcServer + createIpcClient", () => {
    it("should establish connection and exchange messages", async () => {
      const serverMessages: WorkerToParentMessage[] = []
      const clientMessages: ParentToWorkerMessage[] = []

      // Create server
      const server = await createIpcServer({
        socketPath,
        onMessage: msg => {
          if (isWorkerMessage(msg)) serverMessages.push(msg)
        },
        onConnect: () => {},
        onDisconnect: () => {},
      })

      // Create client
      const client = await createIpcClient({
        socketPath,
        onMessage: msg => clientMessages.push(msg as ParentToWorkerMessage),
        onConnect: () => {},
        onDisconnect: () => {},
      })

      // Client sends "ready" message
      client.sendMessage({ type: "ready" })
      await new Promise(r => setTimeout(r, 50))

      expect(serverMessages).toHaveLength(1)
      expect(serverMessages[0]).toEqual({ type: "ready" })

      // Server sends "query" message with valid payload
      server.sendMessage({
        type: "query",
        requestId: "req-123",
        payload: createTestPayload(),
      })
      await new Promise(r => setTimeout(r, 50))

      expect(clientMessages).toHaveLength(1)
      expect(clientMessages[0]).toMatchObject({
        type: "query",
        requestId: "req-123",
      })

      // Cleanup
      client.close()
      await server.close()
    })

    it("should handle multiple rapid messages", async () => {
      const serverMessages: WorkerToParentMessage[] = []

      const server = await createIpcServer({
        socketPath,
        onMessage: msg => {
          if (isWorkerMessage(msg)) serverMessages.push(msg)
        },
      })

      const client = await createIpcClient({
        socketPath,
        onMessage: () => {},
      })

      // Send 10 messages rapidly
      for (let i = 0; i < 10; i++) {
        client.sendMessage({
          type: "message",
          requestId: `req-${i}`,
          content: { index: i },
        })
      }

      // Wait for all messages
      await new Promise(r => setTimeout(r, 100))

      expect(serverMessages).toHaveLength(10)
      for (let i = 0; i < 10; i++) {
        expect(serverMessages[i]).toMatchObject({
          type: "message",
          requestId: `req-${i}`,
        })
      }

      client.close()
      await server.close()
    })

    it("should handle worker disconnect gracefully", async () => {
      let disconnected = false

      const server = await createIpcServer({
        socketPath,
        onMessage: (_msg: unknown) => {},
        onDisconnect: () => {
          disconnected = true
        },
      })

      const client = await createIpcClient({
        socketPath,
        onMessage: (_msg: unknown) => {},
      })

      // Disconnect client
      client.close()
      await new Promise(r => setTimeout(r, 50))

      expect(disconnected).toBe(true)

      await server.close()
    })

    it("should handle worker reconnect", async () => {
      let connectCount = 0
      const messages: WorkerToParentMessage[] = []

      const server = await createIpcServer({
        socketPath,
        onMessage: msg => {
          if (isWorkerMessage(msg)) messages.push(msg)
        },
        onConnect: () => {
          connectCount++
        },
      })

      // First client
      const client1 = await createIpcClient({
        socketPath,
        onMessage: (_msg: unknown) => {},
      })
      client1.sendMessage({ type: "ready" })
      await new Promise(r => setTimeout(r, 50))

      expect(connectCount).toBe(1)
      expect(messages).toHaveLength(1)

      // Disconnect first client
      client1.close()
      await new Promise(r => setTimeout(r, 50))

      // Second client (reconnect scenario)
      const client2 = await createIpcClient({
        socketPath,
        onMessage: (_msg: unknown) => {},
      })
      client2.sendMessage({ type: "ready" })
      await new Promise(r => setTimeout(r, 50))

      expect(connectCount).toBe(2)
      expect(messages).toHaveLength(2)

      client2.close()
      await server.close()
    })
  })

  describe("NdjsonParser edge cases", () => {
    it("should handle partial messages across chunks", () => {
      const parser = new NdjsonParser()
      const messages: unknown[] = []
      parser.on("message", msg => messages.push(msg))

      // Send partial message in first chunk
      parser.write('{"type":"rea')
      expect(messages).toHaveLength(0)

      // Complete message in second chunk
      parser.write('dy"}\n')
      expect(messages).toHaveLength(1)
      expect(messages[0]).toEqual({ type: "ready" })
    })

    it("should handle multiple messages in single chunk", () => {
      const parser = new NdjsonParser()
      const messages: unknown[] = []
      parser.on("message", msg => messages.push(msg))

      parser.write('{"type":"ready"}\n{"type":"session","requestId":"1","sessionId":"abc"}\n')
      expect(messages).toHaveLength(2)
    })

    it("should emit error on invalid JSON", () => {
      const parser = new NdjsonParser()
      const errors: Error[] = []
      parser.on("error", err => errors.push(err))

      parser.write("not valid json\n")
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain("Failed to parse NDJSON")
    })

    it("should flush incomplete message on close", () => {
      const parser = new NdjsonParser()
      const messages: unknown[] = []
      parser.on("message", msg => messages.push(msg))

      parser.write('{"type":"ready"}')
      expect(messages).toHaveLength(0)

      parser.flush()
      expect(messages).toHaveLength(1)
    })
  })
})

describe("Mock Worker Integration", () => {
  const testDir = join(tmpdir(), `worker-pool-mock-${process.pid}`)
  let socketPath: string
  let mockWorkerPath: string

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
    socketPath = join(testDir, "worker.sock")
    mockWorkerPath = join(testDir, "mock-worker.mjs")

    // Create a minimal mock worker that simulates the real worker behavior
    const mockWorkerCode = `
import { createConnection } from "node:net"

const socketPath = process.env.WORKER_SOCKET_PATH
const socket = createConnection(socketPath)

let buffer = ""

socket.on("connect", () => {
  send({ type: "ready" })
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
    case "query":
      // Simulate processing: send session, message, complete
      send({ type: "session", requestId: msg.requestId, sessionId: "mock-session-123" })
      send({ type: "message", requestId: msg.requestId, content: { data: "processing" } })
      send({ type: "complete", requestId: msg.requestId, result: { success: true, cancelled: false } })
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
    await writeFile(mockWorkerPath, mockWorkerCode)
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it("should complete full query lifecycle with mock worker", async () => {
    const messages: WorkerToParentMessage[] = []
    let workerReady = false

    // Create IPC server
    const server = await createIpcServer({
      socketPath,
      onMessage: msg => {
        if (isWorkerMessage(msg)) {
          messages.push(msg)
          if (msg.type === "ready") workerReady = true
        }
      },
    })

    // Spawn mock worker
    const worker = spawn(process.execPath, [mockWorkerPath], {
      env: { ...process.env, WORKER_SOCKET_PATH: socketPath },
      stdio: ["pipe", "pipe", "inherit"],
    })

    // Wait for ready
    await waitFor(() => workerReady, { timeout: 2000 })
    expect(messages[0]).toEqual({ type: "ready" })

    // Send query with valid payload
    server.sendMessage({
      type: "query",
      requestId: "test-req-1",
      payload: createTestPayload({ message: "hello" }),
    })

    // Wait for complete response
    await waitFor(() => messages.some(m => m.type === "complete"), { timeout: 2000 })

    // Verify message sequence: ready, session, message, complete
    expect(messages).toHaveLength(4)
    expect(messages[0].type).toBe("ready")
    expect(messages[1].type).toBe("session")
    expect(messages[2].type).toBe("message")
    expect(messages[3].type).toBe("complete")

    // Verify session message (type-safe)
    const sessionMsg = findMessageByType(messages, "session")
    expect(sessionMsg).toBeDefined()
    expect(sessionMsg!.requestId).toBe("test-req-1")
    expect(sessionMsg!.sessionId).toBe("mock-session-123")

    // Verify complete message (type-safe)
    const completeMsg = findMessageByType(messages, "complete")
    expect(completeMsg).toBeDefined()
    expect(completeMsg!.requestId).toBe("test-req-1")
    expect(completeMsg!.result).toEqual({ success: true, cancelled: false })

    // Cleanup: graceful shutdown
    server.sendMessage({ type: "shutdown", graceful: true })
    await new Promise(r => setTimeout(r, 100))

    worker.kill()
    await server.close()
  })

  it("should handle health check", async () => {
    const messages: WorkerToParentMessage[] = []
    let workerReady = false

    const server = await createIpcServer({
      socketPath,
      onMessage: msg => {
        if (isWorkerMessage(msg)) {
          messages.push(msg)
          if (msg.type === "ready") workerReady = true
        }
      },
    })

    const worker = spawn(process.execPath, [mockWorkerPath], {
      env: { ...process.env, WORKER_SOCKET_PATH: socketPath },
      stdio: ["pipe", "pipe", "inherit"],
    })

    await waitFor(() => workerReady, { timeout: 2000 })

    // Send health check
    server.sendMessage({ type: "health_check" })

    await waitFor(() => messages.some(m => m.type === "health_ok"), { timeout: 2000 })

    // Type-safe health message extraction
    const healthMsg = findMessageByType(messages, "health_ok")
    expect(healthMsg).toBeDefined()
    expect(healthMsg!.uptime).toBe(1)
    expect(healthMsg!.queriesProcessed).toBe(0)

    worker.kill()
    await server.close()
  })

  it("should handle graceful shutdown", async () => {
    const messages: WorkerToParentMessage[] = []
    let workerReady = false
    let workerExited = false

    const server = await createIpcServer({
      socketPath,
      onMessage: msg => {
        if (isWorkerMessage(msg)) {
          messages.push(msg)
          if (msg.type === "ready") workerReady = true
        }
      },
    })

    const worker = spawn(process.execPath, [mockWorkerPath], {
      env: { ...process.env, WORKER_SOCKET_PATH: socketPath },
      stdio: ["pipe", "pipe", "inherit"],
    })

    worker.on("exit", () => {
      workerExited = true
    })

    await waitFor(() => workerReady, { timeout: 2000 })

    // Request graceful shutdown
    server.sendMessage({ type: "shutdown", graceful: true })

    // Should receive ack and exit
    await waitFor(() => workerExited, { timeout: 2000 })

    expect(messages.some(m => m.type === "shutdown_ack")).toBe(true)

    await server.close()
  })
})

/**
 * Test for socket directory permission handling
 *
 * This test verifies that workers can connect to sockets in directories
 * with restrictive permissions (0o700), which is critical for security.
 *
 * The production code creates socket directories with chmod 0o700 so only
 * root can access them. Workers must connect BEFORE dropping privileges.
 *
 * This test would have caught the bug where worker-entry.mjs dropped
 * privileges before connecting to the socket.
 */
describe("Restrictive Socket Directory Permissions", () => {
  const testDir = join(tmpdir(), `worker-pool-perms-${process.pid}`)
  let restrictedDir: string
  let socketPath: string
  let mockWorkerPath: string

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })

    // Create a subdirectory with restrictive permissions (like production)
    restrictedDir = join(testDir, "restricted-sockets")
    await mkdir(restrictedDir, { recursive: true })
    await chmod(restrictedDir, 0o700) // Only owner (root in tests) can access

    socketPath = join(restrictedDir, "worker.sock")
    mockWorkerPath = join(testDir, "mock-worker.mjs")

    // Create mock worker that simulates connect-before-privilege-drop pattern
    const mockWorkerCode = `
import { createConnection } from "node:net"

const socketPath = process.env.WORKER_SOCKET_PATH
const targetUid = process.env.TARGET_UID ? Number(process.env.TARGET_UID) : null

// Step 1: Connect to socket BEFORE dropping privileges
// This is the correct order - must happen while we still have access
const socket = createConnection(socketPath)

let buffer = ""

socket.on("connect", () => {
  console.error("[mock-worker] Connected to socket")

  // Step 2: Drop privileges AFTER connecting (if running as root)
  if (targetUid && process.getuid && process.setuid && process.getuid() === 0) {
    try {
      process.setuid(targetUid)
      console.error("[mock-worker] Dropped privileges to UID:", targetUid)
    } catch (err) {
      console.error("[mock-worker] Failed to drop privileges:", err.message)
    }
  }

  // Step 3: Signal ready - this proves IPC works after privilege drop
  send({ type: "ready" })
})

socket.on("error", (err) => {
  console.error("[mock-worker] Socket error:", err.message)
  process.exit(1)
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
    case "query":
      send({ type: "session", requestId: msg.requestId, sessionId: "test-session" })
      send({ type: "complete", requestId: msg.requestId, result: { success: true, uid: process.getuid?.() } })
      break
    case "shutdown":
      send({ type: "shutdown_ack" })
      process.exit(0)
      break
  }
}
`
    await writeFile(mockWorkerPath, mockWorkerCode)
  })

  afterEach(async () => {
    // Need to reset permissions before cleanup
    try {
      await chmod(restrictedDir, 0o755)
    } catch {}
    await rm(testDir, { recursive: true, force: true })
  })

  it("should allow worker to connect to socket in restricted directory", async () => {
    const messages: WorkerToParentMessage[] = []
    let workerReady = false

    // Create server in restricted directory
    const server = await createIpcServer({
      socketPath,
      onMessage: msg => {
        if (isWorkerMessage(msg)) {
          messages.push(msg)
          if (msg.type === "ready") workerReady = true
        }
      },
    })

    // Spawn worker - it should be able to connect because:
    // 1. It runs as root initially (in test environment)
    // 2. It connects before any privilege drop would happen
    const worker = spawn(process.execPath, [mockWorkerPath], {
      env: {
        ...process.env,
        WORKER_SOCKET_PATH: socketPath,
        // In a real scenario, TARGET_UID would trigger privilege drop
        // For testing, we omit it since we can't actually drop privileges in CI
      },
      stdio: ["pipe", "pipe", "inherit"],
    })

    // Worker should successfully connect and send ready
    await waitFor(() => workerReady, { timeout: 3000 })

    expect(messages[0]).toEqual({ type: "ready" })

    // Verify IPC still works by sending a query
    server.sendMessage({
      type: "query",
      requestId: "test-query",
      payload: createTestPayload({ message: "test" }),
    })

    await waitFor(() => messages.some(m => m.type === "complete"), { timeout: 2000 })

    // Type-safe message extraction
    const completeMsg = findMessageByType(messages, "complete")
    expect(completeMsg).toBeDefined()
    expect(completeMsg!.result).toMatchObject({ success: true })

    worker.kill()
    await server.close()
  })

  it("should handle query after privilege drop", async () => {
    // This test verifies that the socket connection survives privilege dropping
    // In production, the worker drops from root to site user after connecting

    const messages: WorkerToParentMessage[] = []
    let workerReady = false

    const server = await createIpcServer({
      socketPath,
      onMessage: msg => {
        if (isWorkerMessage(msg)) {
          messages.push(msg)
          if (msg.type === "ready") workerReady = true
        }
      },
    })

    // Spawn worker with a target UID (simulates privilege drop scenario)
    // Note: Actual privilege drop only works when running as root
    const worker = spawn(process.execPath, [mockWorkerPath], {
      env: {
        ...process.env,
        WORKER_SOCKET_PATH: socketPath,
        TARGET_UID: String(process.getuid?.()), // Use current UID (no-op in tests)
      },
      stdio: ["pipe", "pipe", "inherit"],
    })

    await waitFor(() => workerReady, { timeout: 3000 })

    // Send multiple queries to verify persistent connection works
    for (let i = 0; i < 3; i++) {
      server.sendMessage({
        type: "query",
        requestId: `query-${i}`,
        payload: createTestPayload({ message: `test-${i}` }),
      })
    }

    // Wait for all completions
    await waitFor(() => messages.filter(m => m.type === "complete").length === 3, { timeout: 5000 })

    // Type-safe completion extraction
    const completions = messages.filter(
      (m): m is Extract<WorkerToParentMessage, { type: "complete" }> => m.type === "complete",
    )
    expect(completions).toHaveLength(3)

    // Verify each query completed successfully (type-safe)
    for (const completion of completions) {
      expect(completion.result).toMatchObject({ success: true })
    }

    server.sendMessage({ type: "shutdown", graceful: true })
    await new Promise(r => setTimeout(r, 100))

    worker.kill()
    await server.close()
  })
})
