/**
 * Worker Pool Manager
 *
 * Manages persistent worker processes with Unix socket IPC.
 * Workers are keyed by workspace and reused across requests.
 */

import { type ChildProcess, execFile, spawn } from "node:child_process"
import { EventEmitter } from "node:events"
import { chmod, mkdir, stat } from "node:fs/promises"
import { cpus, loadavg, platform } from "node:os"
import * as path from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { promisify } from "node:util"
import { isPathWithinWorkspace, PATHS, SUPERADMIN } from "@webalive/shared"
import { createConfig } from "./config.js"
import { createIpcServer, type IpcServer, isWorkerMessage } from "./ipc.js"
import type {
  ParentToWorkerMessage,
  QueryOptions,
  QueryResult,
  WorkerHandle,
  WorkerInfo,
  WorkerPoolConfig,
  WorkerPoolEventListener,
  WorkerPoolEvents,
  WorkerQueryFailureDiagnostics,
  WorkerToParentMessage,
  WorkspaceCredentials,
} from "./types.js"

const execFileAsync = promisify(execFile)

/** Pending query with callbacks */
interface PendingQuery {
  requestId: string
  ownerKey: string
  workspaceKey: string
  resolve: (result: QueryResult) => void
  reject: (error: Error) => void
  onMessage: (msg: WorkerToParentMessage) => void
  cleanup: () => void
  cleanupAccounting: () => void
  sessionId?: string
  result?: unknown
}

interface WorkerPoolQueryError extends Error {
  stderr?: string
  diagnostics?: WorkerQueryFailureDiagnostics
}

/** Internal worker handle with IPC and pending queries */
interface WorkerHandleInternal extends WorkerHandle {
  ipc: IpcServer | null
  pendingQueries: Map<string, PendingQuery>
  credentialsVersion: string | null
  needsRestartForCredentials: boolean
  currentOwnerKey: string | null
  retiredAfterCancel: boolean
}

type DeferReason = "capacity" | "user_limit" | "workspace_limit" | "load_shed"

/** Queued request waiting for worker to become available */
interface QueuedRequest {
  credentials: WorkspaceCredentials
  options: QueryOptions
  resolve: (result: QueryResult) => void
  reject: (error: Error) => void
  enqueuedAtMs: number
  cleanupSignalAbortListener: () => void
}

interface WorkspaceQueue {
  owners: Map<string, QueuedRequest[]>
  order: string[]
  cursor: number
  total: number
}

interface PoolTelemetry {
  retiredAfterCancel: number
  groupTerminations: number
  groupKillEscalations: number
  queueRejectedUser: number
  queueRejectedWorkspace: number
  queueRejectedGlobal: number
  loadShedEvents: number
  orphansReaped: number
}

export type WorkerPoolLimitCode = "QUEUE_FULL" | "USER_LIMIT" | "WORKSPACE_LIMIT" | "LOAD_SHED"

export class WorkerPoolLimitError extends Error {
  readonly code: WorkerPoolLimitCode

  constructor(code: WorkerPoolLimitCode, message: string) {
    super(message)
    this.name = "WorkerPoolLimitError"
    this.code = code
  }
}

/**
 * Validate workspace credentials.
 * Throws on invalid input to prevent security issues from propagating.
 */
function validateCredentials(credentials: WorkspaceCredentials): void {
  const errors: string[] = []

  if (!Number.isInteger(credentials.uid) || credentials.uid < 0) {
    errors.push(`uid must be non-negative integer, got: ${credentials.uid}`)
  }

  if (!Number.isInteger(credentials.gid) || credentials.gid < 0) {
    errors.push(`gid must be non-negative integer, got: ${credentials.gid}`)
  }

  if (typeof credentials.cwd !== "string" || credentials.cwd.length === 0) {
    errors.push("cwd must be non-empty string")
  } else if (!credentials.cwd.startsWith("/")) {
    errors.push(`cwd must be absolute path, got: ${credentials.cwd}`)
  } else {
    const resolvedCwd = path.resolve(credentials.cwd)
    const isWithinSitesRoot = isPathWithinWorkspace(resolvedCwd, PATHS.SITES_ROOT)
    const isSuperadminWorkspace = resolvedCwd === SUPERADMIN.WORKSPACE_PATH
    if (!isWithinSitesRoot && !isSuperadminWorkspace) {
      errors.push(`cwd must be within ${PATHS.SITES_ROOT} or be superadmin workspace, got: ${credentials.cwd}`)
    }
  }

  if (typeof credentials.workspaceKey !== "string" || credentials.workspaceKey.length === 0) {
    errors.push("workspaceKey must be non-empty string")
  }

  if (errors.length > 0) {
    throw new Error(`Invalid credentials: ${errors.join("; ")}`)
  }
}

/**
 * WorkerPoolManager
 *
 * Singleton that manages persistent worker processes.
 * Multiple workers can serve the same workspace (keyed by workspaceKey:instanceId).
 * When all workers for a workspace are busy, requests are queued with fairness.
 */
export class WorkerPoolManager extends EventEmitter {
  private workers = new Map<string, WorkerHandleInternal>()
  private nextInstanceId = new Map<string, number>()
  private requestQueues = new Map<string, WorkspaceQueue>()
  private config: WorkerPoolConfig
  private evictionTimer: ReturnType<typeof setInterval> | null = null
  private orphanSweepTimer: ReturnType<typeof setInterval> | null = null
  private queueDrainTimer: ReturnType<typeof setInterval> | null = null
  private isShuttingDown = false
  private credentialsVersion: string | null = null
  private lastCredentialsCheckMs = 0
  private activeByOwner = new Map<string, number>()
  private activeByWorkspace = new Map<string, number>()
  private queuedByOwner = new Map<string, number>()
  private queuedByWorkspace = new Map<string, number>()
  private totalQueued = 0
  private knownWorkerPids = new Set<number>()
  private telemetry: PoolTelemetry = {
    retiredAfterCancel: 0,
    groupTerminations: 0,
    groupKillEscalations: 0,
    queueRejectedUser: 0,
    queueRejectedWorkspace: 0,
    queueRejectedGlobal: 0,
    loadShedEvents: 0,
    orphansReaped: 0,
  }

  constructor(config?: Partial<WorkerPoolConfig>) {
    super()
    this.config = createConfig(config)
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  async query(credentials: WorkspaceCredentials, options: QueryOptions): Promise<QueryResult> {
    const { requestId, ownerKey, payload, onMessage, signal } = options
    const queryStartTime = Date.now()
    const timing = (label: string) =>
      console.log(`[pool ${requestId}] [TIMING] ${label}: +${Date.now() - queryStartTime}ms`)

    timing("query_start")

    validateCredentials(credentials)
    if (!ownerKey || typeof ownerKey !== "string") {
      throw new Error("Query ownerKey is required")
    }

    const useOAuth = !payload.apiKey
    if (useOAuth) {
      await this.ensureOAuthCredentialsFresh(requestId)
    }

    if (signal?.aborted) {
      console.error(`[pool] Signal already aborted for ${requestId} - returning early`)
      return { success: true, cancelled: true }
    }

    const baseWorkspaceKey = credentials.workspaceKey

    // Enforce per-owner/workspace concurrency before attempting ready-worker reuse.
    // getOrCreateWorker also enforces these limits on spawn-paths for consistency.
    if (this.getActiveByOwner(ownerKey) >= this.config.maxWorkersPerUser) {
      return this.queueRequest(credentials, options, "USER_LIMIT")
    }
    if (this.getActiveByWorkspace(baseWorkspaceKey) >= this.config.maxWorkersPerWorkspace) {
      return this.queueRequest(credentials, options, "WORKSPACE_LIMIT")
    }

    const workerResolution = await this.getOrCreateWorker(credentials, useOAuth, ownerKey)
    const worker = workerResolution.worker
    timing("got_or_created_worker")

    if (!worker) {
      switch (workerResolution.reason) {
        case "user_limit":
          return this.queueRequest(credentials, options, "USER_LIMIT")
        case "workspace_limit":
          return this.queueRequest(credentials, options, "WORKSPACE_LIMIT")
        case "load_shed":
          return this.queueRequest(credentials, options, "LOAD_SHED")
        default:
          return this.queueRequest(credentials, options, "QUEUE_FULL")
      }
    }

    if (signal?.aborted) {
      console.error(`[pool] Signal aborted during worker spawn for ${requestId} - returning early`)
      return { success: true, cancelled: true }
    }

    if (worker.state === "starting") {
      timing("waiting_for_worker_ready")
      await this.waitForReady(worker)
      timing("worker_ready")
    }

    if (signal?.aborted) {
      console.error(`[pool] Signal aborted during worker ready wait for ${requestId} - returning early`)
      return { success: true, cancelled: true }
    }

    if (worker.state !== "ready" || worker.retiredAfterCancel) {
      console.log(`[pool ${requestId}] Worker unavailable, queueing request for ${credentials.workspaceKey}`)
      return this.queueRequest(credentials, options, "QUEUE_FULL")
    }

    worker.state = "busy"
    worker.activeRequestId = requestId
    worker.currentOwnerKey = ownerKey
    this.incrementActive(ownerKey, baseWorkspaceKey)
    this.emit("worker:busy", { workspaceKey: worker.workspaceKey, requestId })

    return new Promise((resolve, reject) => {
      let resolved = false

      const abortHandler = () => {
        if (resolved) return
        resolved = true

        console.error(`[pool] Abort triggered for ${worker.workspaceKey}:${requestId}`)

        this.sendToWorker(worker, { type: "cancel", requestId })

        const pending = worker.pendingQueries.get(requestId)
        const retiredOwnerKey = worker.currentOwnerKey
        if (pending) {
          pending.cleanupAccounting()
          signal?.removeEventListener("abort", abortHandler)
          worker.pendingQueries.delete(requestId)
          worker.queriesProcessed++
          worker.activeRequestId = null
          worker.currentOwnerKey = null
          worker.lastActivity = new Date()
        }

        resolve({ success: true, cancelled: true, sessionId: pending?.sessionId })

        worker.retiredAfterCancel = true
        worker.state = "shutting_down"
        this.retireWorkerAfterCancel(worker, requestId, retiredOwnerKey).catch(err => {
          console.error(`[pool] Error retiring worker ${worker.workspaceKey} after cancel request ${requestId}:`, err)
        })
      }

      let accountingCleaned = false
      const cleanupAccounting = () => {
        if (accountingCleaned) return
        accountingCleaned = true
        this.decrementActive(ownerKey, baseWorkspaceKey)
      }

      const cleanup = () => {
        signal?.removeEventListener("abort", abortHandler)
        worker.pendingQueries.delete(requestId)
        cleanupAccounting()
        worker.queriesProcessed++
        worker.activeRequestId = null
        worker.currentOwnerKey = null
        worker.lastActivity = new Date()

        if (worker.state === "busy") {
          if (worker.needsRestartForCredentials) {
            worker.needsRestartForCredentials = false
            this.gracefulShutdown(worker, "credentials_changed").catch(err => {
              console.error(`[pool] Error restarting worker ${worker.workspaceKey} after credential change:`, err)
            })
          } else {
            worker.state = "ready"
            this.emit("worker:idle", { workspaceKey: worker.workspaceKey })
          }
        }
      }

      const pending: PendingQuery = {
        requestId,
        ownerKey,
        workspaceKey: baseWorkspaceKey,
        resolve,
        reject,
        onMessage,
        cleanup,
        cleanupAccounting,
      }

      worker.pendingQueries.set(requestId, pending)
      signal?.addEventListener("abort", abortHandler)

      timing("sending_query_to_worker")
      this.sendToWorker(worker, { type: "query", requestId, payload })
    })
  }

  async shutdownWorker(workspaceKey: string, reason = "manual"): Promise<void> {
    const worker = this.workers.get(workspaceKey)
    if (!worker) return

    await this.gracefulShutdown(worker, reason)
  }

  async shutdownAll(): Promise<void> {
    this.isShuttingDown = true
    this.stopEvictionTimer()

    this.rejectAllQueuedRequests("Worker pool is shutting down")

    const workers = Array.from(this.workers.values())
    const shutdowns = workers.map(async worker => {
      this.rejectPendingQueries(worker, "Worker pool is shutting down")
      await this.terminateWorkerTree(worker, "pool_shutdown")
      await this.waitForWorkerExit(worker, this.config.shutdownTimeoutMs + this.config.killGraceMs + 500)
    })
    await Promise.allSettled(shutdowns)

    for (const worker of workers) {
      worker.ipc?.close()
      this.workers.delete(worker.workspaceKey)
    }

    this.resetCounters()
    this.isShuttingDown = false
  }

  getWorkerInfo(): WorkerInfo[] {
    return Array.from(this.workers.values()).map(w => ({
      workspaceKey: w.workspaceKey,
      state: w.state,
      createdAt: w.createdAt,
      lastActivity: w.lastActivity,
      queriesProcessed: w.queriesProcessed,
      isActive: w.activeRequestId !== null,
    }))
  }

  getStats(): {
    totalWorkers: number
    activeWorkers: number
    idleWorkers: number
    maxWorkers: number
    dynamicMaxWorkers: number
    queuedRequests: number
    retiredAfterCancel: number
    groupTerminations: number
    groupKillEscalations: number
    queueRejectedUser: number
    queueRejectedWorkspace: number
    queueRejectedGlobal: number
    loadShedEvents: number
    orphansReaped: number
  } {
    const workers = Array.from(this.workers.values())
    return {
      totalWorkers: workers.length,
      activeWorkers: workers.filter(w => w.state === "busy").length,
      idleWorkers: workers.filter(w => w.state === "ready").length,
      maxWorkers: this.config.maxWorkers,
      dynamicMaxWorkers: this.getDynamicMaxWorkers(),
      queuedRequests: this.totalQueued,
      retiredAfterCancel: this.telemetry.retiredAfterCancel,
      groupTerminations: this.telemetry.groupTerminations,
      groupKillEscalations: this.telemetry.groupKillEscalations,
      queueRejectedUser: this.telemetry.queueRejectedUser,
      queueRejectedWorkspace: this.telemetry.queueRejectedWorkspace,
      queueRejectedGlobal: this.telemetry.queueRejectedGlobal,
      loadShedEvents: this.telemetry.loadShedEvents,
      orphansReaped: this.telemetry.orphansReaped,
    }
  }

  startEvictionTimer(): void {
    if (!this.evictionTimer) {
      this.evictionTimer = setInterval(() => {
        this.evictInactiveWorkers()
      }, 60_000)
      this.evictionTimer.unref()
    }

    if (!this.orphanSweepTimer) {
      this.orphanSweepTimer = setInterval(() => {
        this.sweepOrphanedCliProcesses().catch(err => {
          console.error("[pool] orphan_sweep_failed", { error: err instanceof Error ? err.message : String(err) })
        })
      }, this.config.orphanSweepIntervalMs)
      this.orphanSweepTimer.unref()
    }

    if (!this.queueDrainTimer) {
      this.queueDrainTimer = setInterval(() => {
        this.drainQueueIfLoadDropped()
      }, 5_000)
      this.queueDrainTimer.unref()
    }
  }

  stopEvictionTimer(): void {
    if (this.evictionTimer) {
      clearInterval(this.evictionTimer)
      this.evictionTimer = null
    }
    if (this.orphanSweepTimer) {
      clearInterval(this.orphanSweepTimer)
      this.orphanSweepTimer = null
    }
    if (this.queueDrainTimer) {
      clearInterval(this.queueDrainTimer)
      this.queueDrainTimer = null
    }
  }

  override on<K extends keyof WorkerPoolEvents>(event: K, listener: WorkerPoolEventListener<K>): this {
    return super.on(event, listener)
  }

  override emit<K extends keyof WorkerPoolEvents>(event: K, data: WorkerPoolEvents[K]): boolean {
    if (event === "worker:idle") {
      const { workspaceKey: workerKey } = data as WorkerPoolEvents["worker:idle"]
      const baseWorkspaceKey = workerKey.includes(":") ? workerKey.split(":")[0] : workerKey
      this.runProcessQueue(baseWorkspaceKey, "worker_idle")
    }
    return super.emit(event, data)
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private resetCounters(): void {
    this.activeByOwner.clear()
    this.activeByWorkspace.clear()
    this.queuedByOwner.clear()
    this.queuedByWorkspace.clear()
    this.totalQueued = 0
  }

  private incrementMap(map: Map<string, number>, key: string): void {
    map.set(key, (map.get(key) ?? 0) + 1)
  }

  private decrementMap(map: Map<string, number>, key: string): void {
    const current = map.get(key) ?? 0
    if (current <= 1) {
      map.delete(key)
    } else {
      map.set(key, current - 1)
    }
  }

  private incrementActive(ownerKey: string, workspaceKey: string): void {
    this.incrementMap(this.activeByOwner, ownerKey)
    this.incrementMap(this.activeByWorkspace, workspaceKey)
  }

  private decrementActive(ownerKey: string, workspaceKey: string): void {
    this.decrementMap(this.activeByOwner, ownerKey)
    this.decrementMap(this.activeByWorkspace, workspaceKey)
  }

  private getActiveByOwner(ownerKey: string): number {
    return this.activeByOwner.get(ownerKey) ?? 0
  }

  private getActiveByWorkspace(workspaceKey: string): number {
    return this.activeByWorkspace.get(workspaceKey) ?? 0
  }

  private getDynamicMaxWorkers(): number {
    const cpuCount = Math.max(1, cpus().length)
    const dynamic = Math.max(4, Math.floor(cpuCount * this.config.workersPerCore))
    return Math.min(this.config.maxWorkers, dynamic)
  }

  private shouldLoadShed(): boolean {
    const cpuCount = Math.max(1, cpus().length)
    const currentLoad = loadavg()[0]
    const threshold = cpuCount * this.config.loadShedThreshold
    return currentLoad > threshold
  }

  private getWorkspaceQueue(workspaceKey: string): WorkspaceQueue {
    let queue = this.requestQueues.get(workspaceKey)
    if (!queue) {
      queue = {
        owners: new Map(),
        order: [],
        cursor: 0,
        total: 0,
      }
      this.requestQueues.set(workspaceKey, queue)
    }
    return queue
  }

  private enqueueRequest(workspaceKey: string, request: QueuedRequest): void {
    const ownerKey = request.options.ownerKey
    const queue = this.getWorkspaceQueue(workspaceKey)

    let ownerQueue = queue.owners.get(ownerKey)
    if (!ownerQueue) {
      ownerQueue = []
      queue.owners.set(ownerKey, ownerQueue)
      queue.order.push(ownerKey)
    }

    ownerQueue.push(request)
    queue.total += 1

    this.totalQueued += 1
    this.incrementMap(this.queuedByOwner, ownerKey)
    this.incrementMap(this.queuedByWorkspace, workspaceKey)
  }

  private dequeueNextRequest(workspaceKey: string): QueuedRequest | null {
    const queue = this.requestQueues.get(workspaceKey)
    if (!queue || queue.total === 0 || queue.order.length === 0) return null

    const ownerCount = queue.order.length
    for (let i = 0; i < ownerCount; i++) {
      const index = (queue.cursor + i) % ownerCount
      const ownerKey = queue.order[index]
      const ownerQueue = queue.owners.get(ownerKey)

      if (!ownerQueue || ownerQueue.length === 0) continue

      const request = ownerQueue.shift() ?? null
      queue.cursor = (index + 1) % Math.max(1, queue.order.length)

      if (!request) continue

      if (ownerQueue.length === 0) {
        queue.owners.delete(ownerKey)
        const orderIndex = queue.order.indexOf(ownerKey)
        if (orderIndex >= 0) {
          queue.order.splice(orderIndex, 1)
          if (orderIndex < queue.cursor) {
            queue.cursor = Math.max(0, queue.cursor - 1)
          }
          queue.cursor = queue.cursor % Math.max(1, queue.order.length)
        }
      }

      queue.total -= 1
      if (queue.total <= 0) {
        this.requestQueues.delete(workspaceKey)
      }

      this.totalQueued -= 1
      this.decrementMap(this.queuedByOwner, ownerKey)
      this.decrementMap(this.queuedByWorkspace, workspaceKey)
      request.cleanupSignalAbortListener()

      return request
    }

    return null
  }

  private removeQueuedRequest(workspaceKey: string, ownerKey: string, request: QueuedRequest): boolean {
    const queue = this.requestQueues.get(workspaceKey)
    if (!queue) return false

    const ownerQueue = queue.owners.get(ownerKey)
    if (!ownerQueue) return false

    const idx = ownerQueue.indexOf(request)
    if (idx === -1) return false

    request.cleanupSignalAbortListener()
    ownerQueue.splice(idx, 1)
    queue.total -= 1
    this.totalQueued -= 1
    this.decrementMap(this.queuedByOwner, ownerKey)
    this.decrementMap(this.queuedByWorkspace, workspaceKey)

    if (ownerQueue.length === 0) {
      queue.owners.delete(ownerKey)
      const orderIndex = queue.order.indexOf(ownerKey)
      if (orderIndex >= 0) {
        queue.order.splice(orderIndex, 1)
        if (queue.cursor >= queue.order.length) queue.cursor = 0
      }
    }

    if (queue.total <= 0) {
      this.requestQueues.delete(workspaceKey)
    }

    return true
  }

  private queueRequest(
    credentials: WorkspaceCredentials,
    options: QueryOptions,
    reason: WorkerPoolLimitCode,
  ): Promise<QueryResult> {
    const workspaceKey = credentials.workspaceKey
    const ownerKey = options.ownerKey

    if ((this.queuedByOwner.get(ownerKey) ?? 0) >= this.config.maxQueuedPerUser) {
      this.telemetry.queueRejectedUser += 1
      throw new WorkerPoolLimitError(
        "USER_LIMIT",
        `Queue full for owner ${ownerKey}: maxQueuedPerUser=${this.config.maxQueuedPerUser}`,
      )
    }

    if ((this.queuedByWorkspace.get(workspaceKey) ?? 0) >= this.config.maxQueuedPerWorkspace) {
      this.telemetry.queueRejectedWorkspace += 1
      throw new WorkerPoolLimitError(
        "WORKSPACE_LIMIT",
        `Queue full for workspace ${workspaceKey}: maxQueuedPerWorkspace=${this.config.maxQueuedPerWorkspace}`,
      )
    }

    if (this.totalQueued >= this.config.maxQueuedGlobal) {
      this.telemetry.queueRejectedGlobal += 1
      throw new WorkerPoolLimitError("QUEUE_FULL", `Global queue full: maxQueuedGlobal=${this.config.maxQueuedGlobal}`)
    }

    return new Promise((resolve, reject) => {
      let abortListenerCleaned = false
      let queuedRequest: QueuedRequest | null = null
      const onAbort = () => {
        cleanupSignalAbortListener()
        if (queuedRequest && this.removeQueuedRequest(workspaceKey, ownerKey, queuedRequest)) {
          console.log("[pool] removed_aborted_queued_request", {
            requestId: options.requestId,
            ownerKey,
            workspaceKey,
          })
          resolve({ success: true, cancelled: true })
        }
      }
      const cleanupSignalAbortListener = () => {
        if (abortListenerCleaned) return
        abortListenerCleaned = true
        options.signal?.removeEventListener("abort", onAbort)
      }

      queuedRequest = {
        credentials,
        options,
        resolve,
        reject,
        enqueuedAtMs: Date.now(),
        cleanupSignalAbortListener,
      }

      this.enqueueRequest(workspaceKey, queuedRequest)

      console.log("[pool] request_queued", {
        requestId: options.requestId,
        ownerKey,
        workspaceKey,
        reason,
        workspaceQueue: this.queuedByWorkspace.get(workspaceKey) ?? 0,
        ownerQueue: this.queuedByOwner.get(ownerKey) ?? 0,
        totalQueued: this.totalQueued,
      })

      options.signal?.addEventListener("abort", onAbort, { once: true })
      if (options.signal?.aborted) {
        onAbort()
      }
    })
  }

  private async processQueue(workspaceKey: string): Promise<void> {
    const request = this.dequeueNextRequest(workspaceKey)
    if (!request) return

    console.log("[pool] processing_queued_request", {
      requestId: request.options.requestId,
      ownerKey: request.options.ownerKey,
      workspaceKey,
      queuedForMs: Date.now() - request.enqueuedAtMs,
      remainingWorkspaceQueue: this.queuedByWorkspace.get(workspaceKey) ?? 0,
      remainingGlobalQueue: this.totalQueued,
    })

    try {
      const result = await this.query(request.credentials, request.options)
      request.resolve(result)
    } catch (error) {
      request.reject(error instanceof Error ? error : new Error(String(error)))
    }
  }

  private getClaudeConfigDir(): string {
    const configured = process.env.CLAUDE_CONFIG_DIR
    if (configured?.startsWith("/")) {
      return configured
    }
    const home = process.env.HOME || "/root"
    return path.join(home, ".claude")
  }

  private getCredentialsPath(): string {
    return path.join(this.getClaudeConfigDir(), ".credentials.json")
  }

  private async ensureDirTraversal(dirPath: string): Promise<boolean> {
    if (dirPath === "/") return false
    try {
      const stats = await stat(dirPath)
      if (!stats.isDirectory()) return false
      const mode = stats.mode & 0o777
      const desired = mode | 0o011
      if (desired !== mode) {
        await chmod(dirPath, desired)
        return true
      }
      return false
    } catch {
      return false
    }
  }

  private async getCredentialsVersion(): Promise<{ version: string; permissionsAdjusted: boolean } | null> {
    const credentialsPath = this.getCredentialsPath()
    try {
      const stats = await stat(credentialsPath)
      let permissionsAdjusted = false

      const credentialsDir = path.dirname(credentialsPath)
      const parentDir = path.dirname(credentialsDir)
      if (await this.ensureDirTraversal(credentialsDir)) permissionsAdjusted = true
      if (await this.ensureDirTraversal(parentDir)) permissionsAdjusted = true

      const mode = stats.mode & 0o777
      const desired = mode | 0o044
      if (desired !== mode) {
        await chmod(credentialsPath, desired)
        permissionsAdjusted = true
      }

      return { version: `${stats.mtimeMs}:${stats.size}`, permissionsAdjusted }
    } catch {
      return null
    }
  }

  private async ensureOAuthCredentialsFresh(requestId: string): Promise<void> {
    const now = Date.now()
    if (now - this.lastCredentialsCheckMs < 1000) return
    this.lastCredentialsCheckMs = now

    const result = await this.getCredentialsVersion()
    if (!result) return

    const { version, permissionsAdjusted } = result

    if (!this.credentialsVersion) {
      this.credentialsVersion = version
      if (permissionsAdjusted) {
        await this.restartWorkersForCredentialsChange(version, requestId, true)
      } else {
        for (const worker of this.workers.values()) {
          if (!worker.credentialsVersion) {
            worker.credentialsVersion = version
          }
        }
      }
      return
    }

    if (this.credentialsVersion === version && !permissionsAdjusted) return

    this.credentialsVersion = version
    await this.restartWorkersForCredentialsChange(version, requestId, permissionsAdjusted)
  }

  private async restartWorkersForCredentialsChange(version: string, requestId: string, force: boolean): Promise<void> {
    console.error(`[pool ${requestId}] OAuth credentials changed - restarting idle workers`)

    const shutdowns: Promise<void>[] = []
    for (const worker of this.workers.values()) {
      if (!force && worker.credentialsVersion === version && !worker.needsRestartForCredentials) continue

      if (worker.state === "ready") {
        worker.needsRestartForCredentials = false
        shutdowns.push(
          this.gracefulShutdown(worker, "credentials_changed").catch(err => {
            console.error(`[pool] Error restarting worker ${worker.workspaceKey} after credential change:`, err)
          }),
        )
      } else if (worker.state === "busy") {
        worker.needsRestartForCredentials = true
      }
    }

    if (shutdowns.length > 0) {
      await Promise.all(shutdowns)
    }
  }

  private async getOrCreateWorker(
    credentials: WorkspaceCredentials,
    useOAuth: boolean,
    ownerKey: string,
  ): Promise<{ worker: WorkerHandleInternal | null; reason?: DeferReason }> {
    const workspaceKey = credentials.workspaceKey

    for (const [key, worker] of this.workers) {
      if (!key.startsWith(`${workspaceKey}:`)) continue
      if (worker.state !== "ready") continue
      if (worker.retiredAfterCancel) continue

      if (useOAuth) {
        if (worker.needsRestartForCredentials) {
          this.gracefulShutdown(worker, "credentials_changed").catch(err => {
            console.error(`[pool] Error restarting worker ${worker.workspaceKey} after credential change:`, err)
          })
          continue
        }

        if (this.credentialsVersion && worker.credentialsVersion !== this.credentialsVersion) {
          worker.needsRestartForCredentials = true
          this.gracefulShutdown(worker, "credentials_changed").catch(err => {
            console.error(`[pool] Error restarting worker ${worker.workspaceKey} after credential change:`, err)
          })
          continue
        }
      }

      worker.lastActivity = new Date()
      return { worker }
    }

    if (this.getActiveByOwner(ownerKey) >= this.config.maxWorkersPerUser) {
      return { worker: null, reason: "user_limit" }
    }

    if (this.getActiveByWorkspace(workspaceKey) >= this.config.maxWorkersPerWorkspace) {
      return { worker: null, reason: "workspace_limit" }
    }

    if (this.shouldLoadShed()) {
      this.telemetry.loadShedEvents += 1
      return { worker: null, reason: "load_shed" }
    }

    const maxWorkersNow = this.getDynamicMaxWorkers()
    if (this.workers.size >= maxWorkersNow) {
      const evicted = await this.evictWorker()
      if (!evicted) {
        return { worker: null, reason: "capacity" }
      }
    }

    const instanceId = this.nextInstanceId.get(workspaceKey) ?? 0
    this.nextInstanceId.set(workspaceKey, instanceId + 1)

    return {
      worker: await this.spawnWorker(credentials, instanceId),
    }
  }

  private async spawnWorker(credentials: WorkspaceCredentials, instanceId = 0): Promise<WorkerHandleInternal> {
    const { workspaceKey, uid, gid, cwd } = credentials
    const workerKey = `${workspaceKey}:${instanceId}`
    const socketSafeWorkerKey = workerKey.replace(/[^a-zA-Z0-9_-]/g, "_")
    const socketPath = path.join(this.config.socketDir, `worker-${socketSafeWorkerKey}.sock`)

    await mkdir(this.config.socketDir, { recursive: true })
    await chmod(this.config.socketDir, 0o700)

    const ipc = await createIpcServer({
      socketPath,
      onMessage: msg => {
        if (!isWorkerMessage(msg)) {
          console.error(`[pool] Invalid message from worker ${workerKey}:`, msg)
          return
        }
        this.handleWorkerMessage(workerKey, msg)
      },
      onConnect: () => console.error(`[pool] Worker ${workerKey} connected`),
      onDisconnect: () => this.handleWorkerDisconnect(workerKey),
      onError: err => this.emit("pool:error", { error: err, context: workerKey }),
    })

    let child: ChildProcess
    try {
      child = spawn(process.execPath, [this.config.workerEntryPath], {
        env: {
          ...process.env,
          TARGET_UID: String(uid),
          TARGET_GID: String(gid),
          TARGET_CWD: cwd,
          WORKER_SOCKET_PATH: socketPath,
          WORKER_WORKSPACE_KEY: workspaceKey,
        },
        stdio: ["ignore", "inherit", "inherit"],
        // Detached ensures each worker owns a process group so we can terminate the full tree with -pid.
        detached: true,
      })
    } catch (spawnError) {
      await ipc.close()
      throw spawnError
    }

    const pid = child.pid ?? -1
    if (pid > 0) {
      this.knownWorkerPids.add(pid)
    }

    const handle: WorkerHandleInternal = {
      process: child,
      socket: null,
      state: "starting",
      workspaceKey: workerKey,
      credentials,
      createdAt: new Date(),
      lastActivity: new Date(),
      queriesProcessed: 0,
      activeRequestId: null,
      socketPath,
      ipc,
      pendingQueries: new Map(),
      credentialsVersion: this.credentialsVersion,
      needsRestartForCredentials: false,
      currentOwnerKey: null,
      retiredAfterCancel: false,
    }

    child.on("exit", (code, signal) => {
      this.handleWorkerExit(workerKey, code, signal)
    })

    child.on("error", err => {
      this.emit("pool:error", { error: err, context: `spawn:${workerKey}` })
      handle.state = "dead"
      handle.ipc?.close()
      this.rejectPendingQueries(handle, `Worker spawn error: ${err.message}`)
    })

    this.workers.set(workerKey, handle)
    this.emit("worker:spawned", { workspaceKey: workerKey, pid: child.pid! })
    this.startEvictionTimer()

    return handle
  }

  private handleWorkerMessage(workspaceKey: string, msg: WorkerToParentMessage): void {
    const worker = this.workers.get(workspaceKey)
    if (!worker) {
      console.error(`[pool] Received message for unknown worker ${workspaceKey}: ${msg.type}`)
      return
    }

    switch (msg.type) {
      case "ready":
        if (!worker.retiredAfterCancel) {
          worker.state = "ready"
          this.emit("worker:ready", { workspaceKey, pid: worker.process.pid! })
        }
        break
      case "shutdown_ack":
        worker.state = "dead"
        break
      case "health_ok":
        console.error(
          `[pool] Worker ${workspaceKey} health OK: uptime=${msg.uptime}ms, queries=${msg.queriesProcessed}`,
        )
        break
      case "session":
      case "message":
      case "complete":
      case "error": {
        if (!("requestId" in msg) || typeof msg.requestId !== "string" || !msg.requestId) {
          console.error(`[pool] Message missing valid requestId from worker ${workspaceKey}:`, msg.type)
          return
        }
        const requestId = msg.requestId

        const pending = worker.pendingQueries.get(requestId)
        if (!pending) {
          console.error(`[pool] No pending query for requestId ${requestId} from worker ${workspaceKey}`)
          return
        }

        if (msg.type === "session") {
          if (!("sessionId" in msg) || typeof msg.sessionId !== "string") {
            console.error(`[pool] Session message missing sessionId from worker ${workspaceKey}`)
            return
          }
          pending.sessionId = msg.sessionId
          pending.onMessage(msg)
        } else if (msg.type === "message") {
          pending.onMessage(msg)
        } else if (msg.type === "complete") {
          if (!("result" in msg)) {
            console.error(`[pool] Complete message missing result from worker ${workspaceKey}`)
            return
          }
          pending.result = msg.result
          pending.onMessage(msg)
          pending.cleanup()
          pending.resolve({ success: true, sessionId: pending.sessionId, result: pending.result })
        } else if (msg.type === "error") {
          pending.cleanup()
          const errorMessage = "error" in msg && typeof msg.error === "string" ? msg.error : "Unknown error"
          const stderr = "stderr" in msg && typeof msg.stderr === "string" ? msg.stderr : undefined
          const diagnostics =
            "diagnostics" in msg && msg.diagnostics && typeof msg.diagnostics === "object"
              ? (msg.diagnostics as WorkerQueryFailureDiagnostics)
              : undefined
          const workerStack = "stack" in msg && typeof msg.stack === "string" ? msg.stack : undefined

          const error: WorkerPoolQueryError = new Error(errorMessage)
          if (workerStack) {
            error.stack = workerStack
          }
          if (stderr) {
            error.stderr = stderr
          }
          if (diagnostics) {
            error.diagnostics = diagnostics
          }

          pending.reject(error)
        }
        break
      }
    }
  }

  private handleWorkerDisconnect(workspaceKey: string): void {
    const worker = this.workers.get(workspaceKey)
    if (!worker) {
      return
    }

    if (worker.state !== "shutting_down" && worker.state !== "dead") {
      console.error(`[pool] Worker ${workspaceKey} disconnected unexpectedly`)
      worker.state = "dead"
      worker.ipc?.close()
      this.rejectPendingQueries(worker, "Worker disconnected unexpectedly")
    }
  }

  private handleWorkerExit(workspaceKey: string, code: number | null, signal: string | null): void {
    const worker = this.workers.get(workspaceKey)
    if (!worker) {
      return
    }

    const wasShuttingDown = worker.state === "shutting_down"
    worker.state = "dead"

    const exitReason = signal ? `signal ${signal}` : `exit code ${code}`
    this.rejectPendingQueries(worker, `Worker exited: ${exitReason}`)

    worker.ipc?.close()

    if (!wasShuttingDown && !this.isShuttingDown) {
      this.emit("worker:crashed", { workspaceKey, exitCode: code, signal })
    } else {
      this.emit("worker:shutdown", {
        workspaceKey,
        reason: signal ? `signal:${signal}` : `exit:${code}`,
      })
    }

    this.workers.delete(workspaceKey)

    const baseWorkspaceKey = workspaceKey.includes(":") ? workspaceKey.split(":")[0] : workspaceKey
    this.runProcessQueue(baseWorkspaceKey, "worker_exit")
  }

  private rejectPendingQueries(worker: WorkerHandleInternal, reason: string): void {
    for (const pending of worker.pendingQueries.values()) {
      pending.cleanup()
      pending.reject(new Error(reason))
    }
    worker.pendingQueries.clear()
  }

  private runProcessQueue(workspaceKey: string, source: "worker_idle" | "worker_exit" | "drain_timer"): void {
    this.processQueue(workspaceKey).catch(error => {
      const err = error instanceof Error ? error : new Error(String(error))
      console.error("[pool] process_queue_failed", {
        workspaceKey,
        source,
        error: err.message,
      })
      this.emit("pool:error", {
        error: err,
        context: `processQueue:${source}:${workspaceKey}`,
      })
    })
  }

  /**
   * Periodically retry queued requests when system load drops.
   * Prevents starvation when requests are queued during load shedding
   * but no workers exist to trigger queue processing via worker_idle/worker_exit.
   */
  private drainQueueIfLoadDropped(): void {
    if (this.totalQueued === 0) return
    if (this.shouldLoadShed()) return

    const workspaceKeys = [...this.requestQueues.keys()]
    for (const workspaceKey of workspaceKeys) {
      const queue = this.requestQueues.get(workspaceKey)
      if (!queue || queue.total === 0) continue

      console.log("[pool] queue_drain_retry", {
        workspaceKey,
        queued: queue.total,
        totalQueued: this.totalQueued,
        load1m: loadavg()[0].toFixed(2),
      })

      this.runProcessQueue(workspaceKey, "drain_timer")
    }
  }

  private rejectAllQueuedRequests(reason: string): void {
    for (const workspaceQueue of this.requestQueues.values()) {
      for (const ownerQueue of workspaceQueue.owners.values()) {
        for (const request of ownerQueue) {
          request.cleanupSignalAbortListener()
          request.reject(new Error(reason))
        }
      }
    }

    this.requestQueues.clear()
    this.queuedByOwner.clear()
    this.queuedByWorkspace.clear()
    this.totalQueued = 0
  }

  private async waitForWorkerExit(worker: WorkerHandleInternal, timeoutMs: number): Promise<void> {
    const processHandle = worker.process
    if (processHandle.exitCode !== null || processHandle.signalCode !== null) {
      return
    }

    await new Promise<void>(resolve => {
      const timeout = setTimeout(() => {
        cleanup()
        resolve()
      }, timeoutMs)

      const onExit = () => {
        cleanup()
        resolve()
      }

      const cleanup = () => {
        clearTimeout(timeout)
        processHandle.off("exit", onExit)
      }

      processHandle.on("exit", onExit)
    })
  }

  private async waitForReady(worker: WorkerHandleInternal): Promise<void> {
    if (worker.state === "ready") return

    if (worker.state === "dead") {
      throw new Error(`Worker ${worker.workspaceKey} died while starting`)
    }

    if (worker.state !== "starting") {
      throw new Error(`Worker ${worker.workspaceKey} in unexpected state: ${worker.state}`)
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup()
        worker.state = "dead"
        worker.ipc?.close()
        worker.process.kill("SIGKILL")
        this.workers.delete(worker.workspaceKey)
        reject(new Error(`Worker ${worker.workspaceKey} failed to become ready within ${this.config.readyTimeoutMs}ms`))
      }, this.config.readyTimeoutMs)

      const onReady = (event: { workspaceKey: string }) => {
        if (event.workspaceKey === worker.workspaceKey) {
          cleanup()
          resolve()
        }
      }

      const onCrash = (event: { workspaceKey: string }) => {
        if (event.workspaceKey === worker.workspaceKey) {
          cleanup()
          reject(new Error(`Worker ${worker.workspaceKey} crashed before becoming ready`))
        }
      }

      const cleanup = () => {
        clearTimeout(timeout)
        this.off("worker:ready", onReady)
        this.off("worker:crashed", onCrash)
      }

      this.on("worker:ready", onReady)
      this.on("worker:crashed", onCrash)
    })
  }

  private sendToWorker(worker: WorkerHandleInternal, msg: ParentToWorkerMessage): void {
    worker.ipc?.sendMessage(msg)
  }

  private async gracefulShutdown(worker: WorkerHandleInternal, _reason: string): Promise<void> {
    if (worker.state === "shutting_down" || worker.state === "dead") return

    worker.state = "shutting_down"
    this.sendToWorker(worker, { type: "shutdown", graceful: true })

    await new Promise<void>(resolve => {
      const timeout = setTimeout(() => {
        cleanup()
        void this.terminateWorkerTree(worker, "shutdown_timeout")
          .catch(err => {
            console.error(`[pool] Error terminating worker tree ${worker.workspaceKey}:`, err)
          })
          .finally(resolve)
      }, this.config.shutdownTimeoutMs)

      const onShutdown = (event: { workspaceKey: string }) => {
        if (event.workspaceKey === worker.workspaceKey) {
          cleanup()
          resolve()
        }
      }

      const cleanup = () => {
        clearTimeout(timeout)
        this.off("worker:shutdown", onShutdown)
      }

      this.on("worker:shutdown", onShutdown)
    })
  }

  private async retireWorkerAfterCancel(
    worker: WorkerHandleInternal,
    requestId: string,
    ownerKey: string | null,
  ): Promise<void> {
    this.telemetry.retiredAfterCancel += 1
    console.log("[pool] retiring_worker_after_cancel", {
      requestId,
      workerKey: worker.workspaceKey,
      workspaceKey: worker.credentials.workspaceKey,
      ownerKey,
    })
    await this.terminateWorkerTree(worker, "cancelled")
  }

  private async terminateWorkerTree(worker: WorkerHandleInternal, reason: string): Promise<void> {
    if (worker.state === "dead") return

    worker.state = "shutting_down"

    if (worker.activeRequestId) {
      this.sendToWorker(worker, { type: "cancel", requestId: worker.activeRequestId })
    }
    this.sendToWorker(worker, { type: "shutdown", graceful: false })

    const pid = worker.process.pid
    if (!pid || pid <= 0) return

    console.log("[pool] terminating_worker_tree", {
      workerKey: worker.workspaceKey,
      workspaceKey: worker.credentials.workspaceKey,
      ownerKey: worker.currentOwnerKey,
      reason,
      pid,
    })

    this.telemetry.groupTerminations += 1
    this.killProcessTree(pid, "SIGTERM")

    await sleep(this.config.killGraceMs)

    if (this.workers.has(worker.workspaceKey)) {
      this.telemetry.groupKillEscalations += 1
      this.killProcessTree(pid, "SIGKILL")
    }
  }

  private killProcessTree(pid: number, signal: "SIGTERM" | "SIGKILL"): void {
    try {
      process.kill(-pid, signal)
      return
    } catch {
      // Fallback to single-pid kill below
    }

    try {
      process.kill(pid, signal)
    } catch {
      // Process may already be gone
    }
  }

  private async evictWorker(): Promise<boolean> {
    const candidates = Array.from(this.workers.values()).filter(w => w.state === "ready" && !w.retiredAfterCancel)

    if (candidates.length === 0) {
      this.emit("pool:at_capacity", {
        currentWorkers: this.workers.size,
        maxWorkers: this.getDynamicMaxWorkers(),
      })
      return false
    }

    let toEvict: WorkerHandleInternal

    switch (this.config.evictionStrategy) {
      case "lru":
        toEvict = candidates.sort((a, b) => a.lastActivity.getTime() - b.lastActivity.getTime())[0]
        break
      case "oldest":
        toEvict = candidates.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]
        break
      case "least_used":
        toEvict = candidates.sort((a, b) => a.queriesProcessed - b.queriesProcessed)[0]
        break
    }

    this.emit("worker:evicted", {
      workspaceKey: toEvict.workspaceKey,
      reason: this.config.evictionStrategy,
    })
    await this.gracefulShutdown(toEvict, "eviction")
    return true
  }

  private evictInactiveWorkers(): void {
    const now = Date.now()

    for (const worker of this.workers.values()) {
      if (worker.state !== "ready") continue

      const inactiveTime = now - worker.lastActivity.getTime()
      const age = now - worker.createdAt.getTime()

      if (inactiveTime > this.config.inactivityTimeoutMs) {
        this.gracefulShutdown(worker, "inactivity").catch(err => {
          console.error(`[pool] Error during inactivity eviction of ${worker.workspaceKey}:`, err)
        })
      } else if (age > this.config.maxAgeMs) {
        this.gracefulShutdown(worker, "max_age").catch(err => {
          console.error(`[pool] Error during max_age eviction of ${worker.workspaceKey}:`, err)
        })
      }
    }
  }

  private async sweepOrphanedCliProcesses(): Promise<void> {
    if (platform() !== "linux") {
      return
    }

    const liveWorkerPids = new Set<number>()
    for (const worker of this.workers.values()) {
      const pid = worker.process.pid
      if (pid && pid > 0) {
        liveWorkerPids.add(pid)
      }
    }

    const { stdout } = await execFileAsync("ps", ["-eo", "pid=,ppid=,etimes=,args="])
    const lines = stdout.split("\n")

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      const match = trimmed.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/)
      if (!match) continue

      const pid = Number(match[1])
      const ppid = Number(match[2])
      const elapsedSeconds = Number(match[3])
      const args = match[4]

      if (!args.includes("claude-agent-sdk/cli.js")) continue

      const ageMs = elapsedSeconds * 1000
      if (ageMs < this.config.orphanMaxAgeMs) continue

      if (!this.knownWorkerPids.has(ppid)) continue
      if (liveWorkerPids.has(ppid)) continue

      this.killProcessTree(pid, "SIGKILL")
      this.telemetry.orphansReaped += 1

      console.error("[pool] orphan_cli_reaped", {
        pid,
        ppid,
        ageMs,
      })
    }

    for (const pid of this.knownWorkerPids) {
      if (!liveWorkerPids.has(pid)) {
        this.knownWorkerPids.delete(pid)
      }
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: WorkerPoolManager | null = null

/**
 * Get the singleton WorkerPoolManager instance.
 *
 * NOTE: Config is only applied on first call. Subsequent calls ignore config
 * and return the existing instance. Use resetWorkerPool() to change config.
 */
export function getWorkerPool(config?: Partial<WorkerPoolConfig>): WorkerPoolManager {
  if (!instance) {
    instance = new WorkerPoolManager(config)
  } else if (config) {
    console.warn(
      "[WorkerPool] getWorkerPool() called with config but instance already exists. " +
        "Config is ignored. Use resetWorkerPool() first to change configuration.",
    )
  }
  return instance
}

/**
 * Reset the singleton (mainly for testing)
 */
export async function resetWorkerPool(): Promise<void> {
  if (instance) {
    await instance.shutdownAll()
    instance = null
  }
}
