import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PATHS, STREAM_TYPES } from "@webalive/shared"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { WorkerPoolLimitError, WorkerPoolManager } from "../src/manager"
import type { AgentRequest, WorkspaceCredentials } from "../src/types"

interface TestContext {
  testDir: string
  workerScriptPath: string
  socketDir: string
}

async function waitFor(
  condition: () => boolean,
  { timeout = 6_000, interval = 20, label = "condition" } = {},
): Promise<void> {
  const start = Date.now()
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error(`waitFor(${label}) timed out after ${timeout}ms`)
    }
    await new Promise(resolve => setTimeout(resolve, interval))
  }
}

async function createContext(): Promise<TestContext> {
  const testDir = await mkdtemp(join(tmpdir(), "wpi-"))
  const socketDir = join(testDir, "s")
  const workerScriptPath = join(testDir, "mock-worker.mjs")

  await writeFile(workerScriptPath, MOCK_WORKER_SCRIPT)
  await chmod(workerScriptPath, 0o755)

  return {
    testDir,
    workerScriptPath,
    socketDir,
  }
}

function buildCredentials(workspaceKey: string): WorkspaceCredentials {
  // PATHS.SITES_ROOT may be empty in test mode; absolute path is still required.
  const cwd = PATHS.SITES_ROOT ? join(PATHS.SITES_ROOT, workspaceKey, "user") : join(tmpdir(), `wp-${workspaceKey}`)

  return {
    uid: 1000,
    gid: 1000,
    cwd,
    workspaceKey,
  }
}

function createPayload(message: string): AgentRequest {
  return {
    message,
    agentConfig: {
      allowedTools: [],
      disallowedTools: [],
      permissionMode: "default",
      settingSources: [],
      oauthMcpServers: {},
      bridgeStreamTypes: STREAM_TYPES,
    },
  }
}

const MOCK_WORKER_SCRIPT = `
import { createConnection } from "node:net"

const socketPath = process.env.WORKER_SOCKET_PATH
const mode = process.env.TEST_WORKER_MODE || "normal"
const socket = createConnection(socketPath)

let buffer = ""
let currentRequestId = null
let timer = null

if (mode === "stubborn") {
  process.on("SIGTERM", () => {
    // Intentionally ignore SIGTERM so manager must escalate to SIGKILL
  })
}

function clearTimer() {
  if (!timer) return
  clearTimeout(timer)
  clearInterval(timer)
  timer = null
}

function send(msg) {
  if (socket && !socket.destroyed) {
    socket.write(JSON.stringify(msg) + "\\n")
  }
}

function complete(requestId, cancelled) {
  send({
    type: "complete",
    requestId,
    result: {
      type: "stream_complete",
      totalMessages: 0,
      result: cancelled ? null : { ok: true },
      cancelled,
    },
  })
}

function parseDelay(message) {
  if (typeof message !== "string") return 20
  const match = message.match(/delay:(\\d+)/)
  if (!match) return 20
  return Number(match[1])
}

function handleQuery(msg) {
  currentRequestId = msg.requestId
  send({ type: "session", requestId: msg.requestId, sessionId: "s-" + msg.requestId })

  if (mode === "stubborn") {
    // Keep event loop alive forever until killed
    timer = setInterval(() => {}, 1000)
    return
  }

  const delay = parseDelay(msg.payload?.message)
  timer = setTimeout(() => {
    if (currentRequestId !== msg.requestId) return
    complete(msg.requestId, false)
    currentRequestId = null
    clearTimer()
  }, delay)
}

function handleCancel(msg) {
  if (mode === "stubborn") {
    return
  }

  if (currentRequestId !== msg.requestId) return
  clearTimer()
  complete(msg.requestId, true)
  currentRequestId = null
}

function handleShutdown() {
  if (mode === "stubborn") {
    return
  }

  send({ type: "shutdown_ack" })
  process.exit(0)
}

socket.on("connect", () => {
  send({ type: "ready" })
})

socket.on("error", () => {
  process.exit(1)
})

socket.on("close", () => {
  if (mode !== "stubborn") {
    process.exit(0)
  }
})

socket.on("data", chunk => {
  buffer += chunk.toString()
  let idx

  while ((idx = buffer.indexOf("\\n")) !== -1) {
    const line = buffer.slice(0, idx).trim()
    buffer = buffer.slice(idx + 1)
    if (!line) continue

    const msg = JSON.parse(line)

    switch (msg.type) {
      case "query":
        handleQuery(msg)
        break
      case "cancel":
        handleCancel(msg)
        break
      case "shutdown":
        handleShutdown()
        break
      case "health_check":
        send({ type: "health_ok", uptime: 1, queriesProcessed: 0 })
        break
    }
  }
})
`

describe("Worker Pool Hardening Integration", () => {
  let ctx: TestContext
  let manager: WorkerPoolManager
  let previousMode: string | undefined
  let previousCi: string | undefined
  let previousVitest: string | undefined

  beforeEach(async () => {
    previousMode = process.env.TEST_WORKER_MODE
    previousCi = process.env.CI
    previousVitest = process.env.VITEST
    process.env.CI = "true"
    process.env.VITEST = "true"
    process.env.TEST_WORKER_MODE = "normal"

    ctx = await createContext()
    manager = new WorkerPoolManager({
      workerEntryPath: ctx.workerScriptPath,
      socketDir: ctx.socketDir,
      maxWorkers: 2,
      inactivityTimeoutMs: 30_000,
      maxAgeMs: 60_000,
      readyTimeoutMs: 2_000,
      shutdownTimeoutMs: 400,
      cancelTimeoutMs: 50,
      killGraceMs: 100,
      orphanSweepIntervalMs: 30_000,
      orphanMaxAgeMs: 60_000,
      maxWorkersPerUser: 1,
      maxWorkersPerWorkspace: 1,
      maxQueuedPerUser: 4,
      maxQueuedPerWorkspace: 8,
      maxQueuedGlobal: 16,
      workersPerCore: 4,
      loadShedThreshold: 100,
    })
  })

  afterEach(async () => {
    await manager.shutdownAll()
    await rm(ctx.testDir, { recursive: true, force: true })

    if (previousMode === undefined) {
      delete process.env.TEST_WORKER_MODE
    } else {
      process.env.TEST_WORKER_MODE = previousMode
    }

    if (previousCi === undefined) {
      delete process.env.CI
    } else {
      process.env.CI = previousCi
    }

    if (previousVitest === undefined) {
      delete process.env.VITEST
    } else {
      process.env.VITEST = previousVitest
    }
  })

  it("retires cancelled workers and spawns a replacement instead of reusing", async () => {
    const credentials = buildCredentials("wk-retire")
    const spawned: string[] = []

    manager.on("worker:spawned", event => {
      spawned.push(event.workspaceKey)
    })

    const abortController = new AbortController()

    const first = manager.query(credentials, {
      requestId: "req-cancel-1",
      ownerKey: "owner-a",
      workloadClass: "chat",
      payload: createPayload("delay:1500"),
      onMessage: () => {},
      signal: abortController.signal,
    })

    await waitFor(() => spawned.length >= 1, { label: "first worker spawned" })
    await waitFor(() => manager.getStats().activeWorkers === 1, {
      label: "first request active",
    })
    abortController.abort()

    const firstResult = await first
    expect(firstResult.success).toBe(true)
    expect(firstResult.cancelled).toBe(true)

    await waitFor(() => manager.getStats().retiredAfterCancel >= 1, {
      label: "retiredAfterCancel metric",
    })

    const secondResult = await manager.query(credentials, {
      requestId: "req-cancel-2",
      ownerKey: "owner-a",
      workloadClass: "chat",
      payload: createPayload("delay:20"),
      onMessage: () => {},
    })

    expect(secondResult.success).toBe(true)
    await waitFor(() => spawned.length >= 2, { label: "replacement worker spawned" })

    expect(new Set(spawned).size).toBeGreaterThanOrEqual(2)
  }, 15_000)

  it("enforces round-robin fairness across owners within a workspace queue", async () => {
    const credentials = buildCredentials("wk-fair")
    const completionOrder: string[] = []

    const run = async (requestId: string, ownerKey: string, message: string) => {
      await manager.query(credentials, {
        requestId,
        ownerKey,
        workloadClass: "chat",
        payload: createPayload(message),
        onMessage: () => {},
      })
      completionOrder.push(requestId)
    }

    const p0 = run("p0", "owner-a", "delay:120")

    await waitFor(() => manager.getStats().activeWorkers === 1, {
      label: "first request active",
    })

    const p1 = run("p1", "owner-a", "delay:10")
    const p2 = run("p2", "owner-a", "delay:10")
    const p3 = run("p3", "owner-b", "delay:10")

    await Promise.all([p0, p1, p2, p3])

    // Queue order should be owner-a first queued item, then owner-b, then owner-a second queued item.
    expect(completionOrder).toEqual(["p0", "p1", "p3", "p2"])
  })

  it("removes aborted queued requests and does not execute them later", async () => {
    const credentials = buildCredentials("wk-queue-abort")
    const queuedAbort = new AbortController()
    let queuedMessageCount = 0

    const p0 = manager.query(credentials, {
      requestId: "queue-abort-p0",
      ownerKey: "owner-a",
      workloadClass: "chat",
      payload: createPayload("delay:160"),
      onMessage: () => {},
    })

    await waitFor(() => manager.getStats().activeWorkers === 1, {
      label: "active worker for queue abort",
    })

    const p1 = manager.query(credentials, {
      requestId: "queue-abort-p1",
      ownerKey: "owner-a",
      workloadClass: "chat",
      payload: createPayload("delay:10"),
      onMessage: () => {
        queuedMessageCount += 1
      },
      signal: queuedAbort.signal,
    })

    await waitFor(() => manager.getStats().queuedRequests === 1, {
      label: "queued request before abort",
    })

    queuedAbort.abort()
    const queuedResult = await p1
    expect(queuedResult.cancelled).toBe(true)
    expect(queuedMessageCount).toBe(0)

    await waitFor(() => manager.getStats().queuedRequests === 0, {
      label: "queue drained after abort",
    })

    await p0
  })

  it("rejects overflow when per-user queue limit is exceeded", async () => {
    const credentials = buildCredentials("wk-limit")

    // Tight queue limit for this test
    await manager.shutdownAll()
    manager = new WorkerPoolManager({
      workerEntryPath: ctx.workerScriptPath,
      socketDir: ctx.socketDir,
      maxWorkers: 1,
      inactivityTimeoutMs: 30_000,
      maxAgeMs: 60_000,
      readyTimeoutMs: 2_000,
      shutdownTimeoutMs: 400,
      cancelTimeoutMs: 50,
      killGraceMs: 100,
      orphanSweepIntervalMs: 30_000,
      orphanMaxAgeMs: 60_000,
      maxWorkersPerUser: 1,
      maxWorkersPerWorkspace: 1,
      maxQueuedPerUser: 1,
      maxQueuedPerWorkspace: 4,
      maxQueuedGlobal: 10,
      workersPerCore: 4,
      loadShedThreshold: 100,
    })

    const p0 = manager.query(credentials, {
      requestId: "limit-p0",
      ownerKey: "owner-a",
      workloadClass: "chat",
      payload: createPayload("delay:140"),
      onMessage: () => {},
    })

    await waitFor(() => manager.getStats().activeWorkers === 1, {
      label: "active worker before queue saturation",
    })

    const p1 = manager.query(credentials, {
      requestId: "limit-p1",
      ownerKey: "owner-a",
      workloadClass: "chat",
      payload: createPayload("delay:10"),
      onMessage: () => {},
    })

    await waitFor(() => manager.getStats().queuedRequests === 1, {
      label: "first queued request",
    })

    await expect(
      manager.query(credentials, {
        requestId: "limit-p2",
        ownerKey: "owner-a",
        workloadClass: "chat",
        payload: createPayload("delay:10"),
        onMessage: () => {},
      }),
    ).rejects.toBeInstanceOf(WorkerPoolLimitError)

    await expect(
      manager.query(credentials, {
        requestId: "limit-p3",
        ownerKey: "owner-a",
        workloadClass: "chat",
        payload: createPayload("delay:10"),
        onMessage: () => {},
      }),
    ).rejects.toMatchObject({ code: "USER_LIMIT" })

    await Promise.all([p0, p1])
    expect(manager.getStats().queueRejectedUser).toBeGreaterThanOrEqual(1)
  })

  it("escalates to SIGKILL for stubborn workers and records telemetry", async () => {
    process.env.TEST_WORKER_MODE = "stubborn"

    await manager.shutdownAll()
    manager = new WorkerPoolManager({
      workerEntryPath: ctx.workerScriptPath,
      socketDir: ctx.socketDir,
      maxWorkers: 2,
      inactivityTimeoutMs: 30_000,
      maxAgeMs: 60_000,
      readyTimeoutMs: 2_000,
      shutdownTimeoutMs: 200,
      cancelTimeoutMs: 50,
      killGraceMs: 80,
      orphanSweepIntervalMs: 30_000,
      orphanMaxAgeMs: 60_000,
      maxWorkersPerUser: 1,
      maxWorkersPerWorkspace: 1,
      maxQueuedPerUser: 4,
      maxQueuedPerWorkspace: 8,
      maxQueuedGlobal: 16,
      workersPerCore: 4,
      loadShedThreshold: 100,
    })

    const credentials = buildCredentials("wk-stubborn")
    const abortController = new AbortController()

    const requestPromise = manager.query(credentials, {
      requestId: "stubborn-p0",
      ownerKey: "owner-a",
      workloadClass: "chat",
      payload: createPayload("delay:1000"),
      onMessage: () => {},
      signal: abortController.signal,
    })

    await waitFor(() => manager.getStats().activeWorkers === 1, {
      label: "stubborn worker active",
    })

    abortController.abort()

    const result = await requestPromise
    expect(result.cancelled).toBe(true)

    await waitFor(() => manager.getStats().groupTerminations >= 1, {
      label: "group termination metric",
    })

    await waitFor(() => manager.getStats().groupKillEscalations >= 1, {
      label: "group kill escalation metric",
      timeout: 8_000,
    })

    await waitFor(() => manager.getWorkerInfo().length === 0, {
      label: "stubborn worker removed",
      timeout: 8_000,
    })
  }, 15_000)

  it("rejects pending and queued requests during shutdownAll", async () => {
    process.env.TEST_WORKER_MODE = "stubborn"

    await manager.shutdownAll()
    manager = new WorkerPoolManager({
      workerEntryPath: ctx.workerScriptPath,
      socketDir: ctx.socketDir,
      maxWorkers: 1,
      inactivityTimeoutMs: 30_000,
      maxAgeMs: 60_000,
      readyTimeoutMs: 2_000,
      shutdownTimeoutMs: 200,
      cancelTimeoutMs: 50,
      killGraceMs: 80,
      orphanSweepIntervalMs: 30_000,
      orphanMaxAgeMs: 60_000,
      maxWorkersPerUser: 1,
      maxWorkersPerWorkspace: 1,
      maxQueuedPerUser: 4,
      maxQueuedPerWorkspace: 8,
      maxQueuedGlobal: 16,
      workersPerCore: 4,
      loadShedThreshold: 100,
    })

    const credentials = buildCredentials("wk-shutdown-reject")

    const pending = manager.query(credentials, {
      requestId: "shutdown-pending",
      ownerKey: "owner-a",
      workloadClass: "chat",
      payload: createPayload("delay:1200"),
      onMessage: () => {},
    })

    await waitFor(() => manager.getStats().activeWorkers === 1, {
      label: "pending query active before shutdown",
    })

    const queued = manager.query(credentials, {
      requestId: "shutdown-queued",
      ownerKey: "owner-a",
      workloadClass: "chat",
      payload: createPayload("delay:10"),
      onMessage: () => {},
    })

    const pendingOutcome = pending.then(
      () => ({ status: "resolved" as const, error: null }),
      error => ({ status: "rejected" as const, error: error as Error }),
    )
    const queuedOutcome = queued.then(
      () => ({ status: "resolved" as const, error: null }),
      error => ({ status: "rejected" as const, error: error as Error }),
    )

    await waitFor(() => manager.getStats().queuedRequests === 1, {
      label: "queued query before shutdown",
    })

    await manager.shutdownAll()

    const pendingSettled = await pendingOutcome
    const queuedSettled = await queuedOutcome
    expect(pendingSettled.status).toBe("rejected")
    expect(queuedSettled.status).toBe("rejected")
    expect(pendingSettled.error?.message).toContain("Worker pool is shutting down")
    expect(queuedSettled.error?.message).toContain("Worker pool is shutting down")
    expect(manager.getStats().queuedRequests).toBe(0)
    expect(manager.getWorkerInfo()).toHaveLength(0)
  })
})
