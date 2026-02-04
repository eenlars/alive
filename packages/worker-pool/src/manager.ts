/**
 * Worker Pool Manager
 *
 * Manages persistent worker processes with Unix socket IPC.
 * Workers are keyed by workspace and reused across requests.
 */

import { spawn, type ChildProcess } from "node:child_process"
import { EventEmitter } from "node:events"
import { chmod, mkdir, stat } from "node:fs/promises"
import type {
  WorkerPoolConfig,
  WorkerHandle,
  WorkerInfo,
  WorkspaceCredentials,
  QueryOptions,
  QueryResult,
  WorkerPoolEvents,
  WorkerPoolEventListener,
  WorkerToParentMessage,
  ParentToWorkerMessage,
} from "./types.js"
import { createConfig, getSocketPath } from "./config.js"
import { createIpcServer, isWorkerMessage, type IpcServer } from "./ipc.js"
import { isPathWithinWorkspace, PATHS, SUPERADMIN } from "@webalive/shared"
import * as path from "node:path"

/** Pending query with callbacks */
interface PendingQuery {
  requestId: string
  resolve: (result: QueryResult) => void
  reject: (error: Error) => void
  onMessage: (msg: WorkerToParentMessage) => void
  cleanup: () => void
  sessionId?: string
  result?: unknown
}

/** Internal worker handle with IPC and pending queries */
interface WorkerHandleInternal extends WorkerHandle {
  ipc: IpcServer | null
  pendingQueries: Map<string, PendingQuery>
  credentialsVersion: string | null
  needsRestartForCredentials: boolean
}

/** Queued request waiting for worker to become available */
interface QueuedRequest {
  credentials: WorkspaceCredentials
  options: QueryOptions
  resolve: (result: QueryResult) => void
  reject: (error: Error) => void
}

/**
 * Validate workspace credentials.
 * Throws on invalid input to prevent security issues from propagating.
 */
function validateCredentials(credentials: WorkspaceCredentials): void {
  const errors: string[] = []

  // Validate uid (must be non-negative integer)
  if (!Number.isInteger(credentials.uid) || credentials.uid < 0) {
    errors.push(`uid must be non-negative integer, got: ${credentials.uid}`)
  }

  // Validate gid (must be non-negative integer)
  if (!Number.isInteger(credentials.gid) || credentials.gid < 0) {
    errors.push(`gid must be non-negative integer, got: ${credentials.gid}`)
  }

  // Validate cwd (must be non-empty absolute path within workspace root)
  if (typeof credentials.cwd !== "string" || credentials.cwd.length === 0) {
    errors.push("cwd must be non-empty string")
  } else if (!credentials.cwd.startsWith("/")) {
    errors.push(`cwd must be absolute path, got: ${credentials.cwd}`)
  } else {
    // Canonical path traversal check using resolved paths
    const resolvedCwd = path.resolve(credentials.cwd)
    // Allow both regular sites and the superadmin workspace (claude-bridge repo)
    const isWithinSitesRoot = isPathWithinWorkspace(resolvedCwd, PATHS.SITES_ROOT)
    const isSuperadminWorkspace = resolvedCwd === SUPERADMIN.WORKSPACE_PATH
    if (!isWithinSitesRoot && !isSuperadminWorkspace) {
      errors.push(`cwd must be within ${PATHS.SITES_ROOT} or be superadmin workspace, got: ${credentials.cwd}`)
    }
  }

  // Validate workspaceKey (must be non-empty)
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
 * When all workers for a workspace are busy, a new instance is spawned.
 */
export class WorkerPoolManager extends EventEmitter {
  // Workers keyed by "workspaceKey:instanceId" (e.g., "example.com:0", "example.com:1")
  private workers = new Map<string, WorkerHandleInternal>()
  // Track next instance ID per workspace
  private nextInstanceId = new Map<string, number>()
  // Queue requests when all workers are busy (keyed by base workspaceKey)
  private requestQueues = new Map<string, QueuedRequest[]>()
  private config: WorkerPoolConfig
  private evictionTimer: ReturnType<typeof setInterval> | null = null
  private isShuttingDown = false
  private credentialsVersion: string | null = null
  private lastCredentialsCheckMs = 0

  constructor(config?: Partial<WorkerPoolConfig>) {
    super()
    this.config = createConfig(config)
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Get or create a worker for a workspace.
   * Multiple workers can exist for the same workspace (different instances).
   * Returns an available worker or spawns a new one if capacity allows.
   * Returns null if all workers are busy and pool is at capacity (caller should queue).
   */
  private async getOrCreateWorker(
    credentials: WorkspaceCredentials,
    useOAuth: boolean,
  ): Promise<WorkerHandleInternal | null> {
    // Validate credentials before any operations
    validateCredentials(credentials)

    const { workspaceKey } = credentials

    // First, try to find an available (ready) worker for this workspace
    for (const [key, worker] of this.workers) {
      if (key.startsWith(`${workspaceKey}:`) && worker.state === "ready") {
        if (useOAuth) {
          // Skip workers that need restart due to credential changes
          if (worker.needsRestartForCredentials) {
            this.gracefulShutdown(worker, "credentials_changed").catch(err => {
              console.error(`[pool] Error restarting worker ${worker.workspaceKey} after credential change:`, err)
            })
            continue
          }

          // If we know the current credentials version and this worker is stale, restart it
          if (this.credentialsVersion && worker.credentialsVersion !== this.credentialsVersion) {
            worker.needsRestartForCredentials = true
            this.gracefulShutdown(worker, "credentials_changed").catch(err => {
              console.error(`[pool] Error restarting worker ${worker.workspaceKey} after credential change:`, err)
            })
            continue
          }
        }

        worker.lastActivity = new Date()
        return worker
      }
    }

    // No available worker - try to spawn a new instance
    if (this.workers.size >= this.config.maxWorkers) {
      // Pool at capacity - try to evict an idle worker from another workspace
      const evicted = await this.evictWorker()
      if (!evicted) {
        // All workers busy - return null to signal caller should queue
        return null
      }
    }

    // Get next instance ID for this workspace
    const instanceId = this.nextInstanceId.get(workspaceKey) ?? 0
    this.nextInstanceId.set(workspaceKey, instanceId + 1)

    // Spawn new worker with instance-specific key
    return this.spawnWorker(credentials, instanceId)
  }

  /**
   * Send a query to a worker and stream results.
   *
   * NOTE: Each worker handles ONE query at a time. If the worker is busy,
   * this method throws immediately. The caller (route.ts) should handle
   * this by waiting or spawning a new worker for a different workspace.
   *
   * For the same workspace, queries are serialized - the second query
   * must wait for the first to complete (enforced by conversation locking
   * at the API layer, not here).
   */
  async query(credentials: WorkspaceCredentials, options: QueryOptions): Promise<QueryResult> {
    const { requestId, payload, onMessage, signal } = options
    const queryStartTime = Date.now()
    const timing = (label: string) =>
      console.log(`[pool ${requestId}] [TIMING] ${label}: +${Date.now() - queryStartTime}ms`)

    timing("query_start")

    // OAuth credentials are shared across workers. If they changed, restart stale workers
    // before selecting a worker for this request.
    const useOAuth = !payload.apiKey
    if (useOAuth) {
      await this.ensureOAuthCredentialsFresh(requestId)
    }

    // CRITICAL: Check if already aborted BEFORE any async work
    // This catches the case where abort() was called before query() even started
    if (signal?.aborted) {
      console.error(`[pool] Signal already aborted for ${requestId} - returning early`)
      return { success: true, cancelled: true }
    }

    const worker = await this.getOrCreateWorker(credentials, useOAuth)
    timing("got_or_created_worker")

    // If no worker available (pool at capacity, all busy), queue the request
    if (!worker) {
      console.log(`[pool ${requestId}] All workers busy, queueing request for ${credentials.workspaceKey}`)
      return this.queueRequest(credentials, options)
    }

    // Check again after async work - abort might have fired during spawn
    if (signal?.aborted) {
      console.error(`[pool] Signal aborted during worker spawn for ${requestId} - returning early`)
      return { success: true, cancelled: true }
    }

    // Wait for worker to be ready
    if (worker.state === "starting") {
      timing("waiting_for_worker_ready")
      await this.waitForReady(worker)
      timing("worker_ready")
    }

    // Check again after waiting for ready - abort might have fired during wait
    if (signal?.aborted) {
      console.error(`[pool] Signal aborted during worker ready wait for ${requestId} - returning early`)
      return { success: true, cancelled: true }
    }

    // Double-check worker is ready (shouldn't happen but safety check)
    if (worker.state === "busy") {
      console.log(`[pool ${requestId}] Worker became busy, queueing request for ${credentials.workspaceKey}`)
      return this.queueRequest(credentials, options)
    }

    if (worker.state !== "ready") {
      throw new Error(`Worker not ready: ${worker.state}`)
    }

    // Mark worker as busy
    worker.state = "busy"
    worker.activeRequestId = requestId
    this.emit("worker:busy", { workspaceKey: worker.workspaceKey, requestId })

    return new Promise((resolve, reject) => {
      // Track cancel timeout for cleanup
      let cancelTimeout: ReturnType<typeof setTimeout> | null = null
      let resolved = false

      // Handle abort signal - resolve IMMEDIATELY so caller can proceed
      // Worker cleanup happens in the background (we don't block on it)
      const abortHandler = () => {
        if (resolved) return
        resolved = true

        console.error(`[pool] Abort triggered for ${worker.workspaceKey}:${requestId}`)

        // Send cancel to worker (background - we don't wait for response)
        this.sendToWorker(worker, { type: "cancel", requestId })

        // Remove from pending queries so delayed worker response is ignored
        // Don't call full cleanup yet - worker is still cleaning up
        signal?.removeEventListener("abort", abortHandler)
        worker.pendingQueries.delete(requestId)

        // CRITICAL: Resolve immediately so caller can proceed
        // This unblocks the NDJSON stream so it can release the lock
        resolve({ success: true, cancelled: true, sessionId: pending.sessionId })

        // Worker state cleanup: Reset to "ready" after giving worker time to clean up
        // The worker might still be processing the abort, so we wait before accepting new requests
        cancelTimeout = setTimeout(() => {
          // Only reset if worker is still marked busy for this request
          if (worker.state === "busy" && worker.activeRequestId === requestId) {
            console.error(`[pool] Cancel timeout for ${worker.workspaceKey}:${requestId} - resetting worker state`)
            worker.queriesProcessed++
            worker.activeRequestId = null
            worker.lastActivity = new Date()
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
        }, this.config.cancelTimeoutMs)
      }

      // Cleanup function - called on success, error, or worker crash
      const cleanup = () => {
        if (cancelTimeout) clearTimeout(cancelTimeout)
        signal?.removeEventListener("abort", abortHandler)
        worker.pendingQueries.delete(requestId)
        worker.queriesProcessed++
        worker.activeRequestId = null
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

      // Create pending query entry
      const pending: PendingQuery = {
        requestId,
        resolve,
        reject,
        onMessage,
        cleanup,
      }

      // Register in pending queries map (keyed by requestId to handle multiple)
      worker.pendingQueries.set(requestId, pending)
      signal?.addEventListener("abort", abortHandler)

      // Send query to worker
      timing("sending_query_to_worker")
      this.sendToWorker(worker, { type: "query", requestId, payload })
    })
  }

  /**
   * Gracefully shutdown a specific worker
   */
  async shutdownWorker(workspaceKey: string, reason = "manual"): Promise<void> {
    const worker = this.workers.get(workspaceKey)
    if (!worker) return

    await this.gracefulShutdown(worker, reason)
  }

  /**
   * Shutdown all workers
   */
  async shutdownAll(): Promise<void> {
    this.isShuttingDown = true
    this.stopEvictionTimer()

    const shutdowns = Array.from(this.workers.keys()).map(key => this.shutdownWorker(key, "pool_shutdown"))
    await Promise.allSettled(shutdowns)

    this.workers.clear()
    this.isShuttingDown = false
  }

  /**
   * Get info about all workers (safe to expose)
   */
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

  /**
   * Get pool statistics
   */
  getStats(): {
    totalWorkers: number
    activeWorkers: number
    idleWorkers: number
    maxWorkers: number
  } {
    const workers = Array.from(this.workers.values())
    return {
      totalWorkers: workers.length,
      activeWorkers: workers.filter(w => w.state === "busy").length,
      idleWorkers: workers.filter(w => w.state === "ready").length,
      maxWorkers: this.config.maxWorkers,
    }
  }

  /**
   * Start the eviction timer for inactive workers
   */
  startEvictionTimer(): void {
    if (this.evictionTimer) return

    // Check every minute, unref so it doesn't prevent process exit
    this.evictionTimer = setInterval(() => {
      this.evictInactiveWorkers()
    }, 60_000)
    this.evictionTimer.unref()
  }

  /**
   * Stop the eviction timer
   */
  stopEvictionTimer(): void {
    if (this.evictionTimer) {
      clearInterval(this.evictionTimer)
      this.evictionTimer = null
    }
  }

  // ==========================================================================
  // Event Emitter Typed Methods
  // ==========================================================================

  override on<K extends keyof WorkerPoolEvents>(event: K, listener: WorkerPoolEventListener<K>): this {
    return super.on(event, listener)
  }

  override emit<K extends keyof WorkerPoolEvents>(event: K, data: WorkerPoolEvents[K]): boolean {
    // When a worker becomes idle, process any queued requests for its workspace
    if (event === "worker:idle") {
      const { workspaceKey: workerKey } = data as WorkerPoolEvents["worker:idle"]
      // Extract base workspace key (remove instance suffix)
      const baseWorkspaceKey = workerKey.includes(":") ? workerKey.split(":")[0] : workerKey
      this.processQueue(baseWorkspaceKey)
    }
    return super.emit(event, data)
  }

  // ==========================================================================
  // Request Queue Methods
  // ==========================================================================

  /**
   * Queue a request when all workers are busy.
   * Returns a promise that resolves when the request is eventually processed.
   */
  private queueRequest(credentials: WorkspaceCredentials, options: QueryOptions): Promise<QueryResult> {
    const { workspaceKey } = credentials

    return new Promise((resolve, reject) => {
      // Get or create queue for this workspace
      let queue = this.requestQueues.get(workspaceKey)
      if (!queue) {
        queue = []
        this.requestQueues.set(workspaceKey, queue)
      }

      const queuedRequest: QueuedRequest = {
        credentials,
        options,
        resolve,
        reject,
      }

      queue.push(queuedRequest)
      console.log(`[pool] Queued request ${options.requestId} for ${workspaceKey} (queue size: ${queue.length})`)

      // Handle abort while queued
      options.signal?.addEventListener("abort", () => {
        const idx = queue!.indexOf(queuedRequest)
        if (idx !== -1) {
          queue!.splice(idx, 1)
          console.log(`[pool] Removed aborted request ${options.requestId} from queue`)
          resolve({ success: true, cancelled: true })
        }
      })
    })
  }

  /**
   * Process queued requests for a workspace when a worker becomes available.
   */
  private processQueue(workspaceKey: string): void {
    const queue = this.requestQueues.get(workspaceKey)
    if (!queue || queue.length === 0) return

    // Take the first request from the queue
    const request = queue.shift()
    if (!request) return

    console.log(
      `[pool] Processing queued request ${request.options.requestId} for ${workspaceKey} (remaining: ${queue.length})`,
    )

    // Process the request (this will find the now-available worker)
    this.query(request.credentials, request.options).then(request.resolve).catch(request.reject)
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  private getClaudeConfigDir(): string {
    const configured = process.env.CLAUDE_CONFIG_DIR
    if (configured && configured.startsWith("/")) {
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
      const desired = mode | 0o011 // ensure group/other execute for traversal
      if (desired !== mode) {
        await chmod(dirPath, desired)
        return true
      }
      return false
    } catch {
      // Best-effort only - absence just means we can't auto-fix
      return false
    }
  }

  private async getCredentialsVersion(): Promise<{ version: string; permissionsAdjusted: boolean } | null> {
    const credentialsPath = this.getCredentialsPath()
    try {
      const stats = await stat(credentialsPath)
      let permissionsAdjusted = false

      // Ensure traversal to credentials dir (e.g., /root/.claude)
      const credentialsDir = path.dirname(credentialsPath)
      const parentDir = path.dirname(credentialsDir)
      if (await this.ensureDirTraversal(credentialsDir)) permissionsAdjusted = true
      if (await this.ensureDirTraversal(parentDir)) permissionsAdjusted = true

      // Ensure file is readable by non-root workers
      const mode = stats.mode & 0o777
      const desired = mode | 0o044 // add group/other read
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
        // Seed existing workers with current version so we don't restart unnecessarily
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

  private async spawnWorker(credentials: WorkspaceCredentials, instanceId: number = 0): Promise<WorkerHandleInternal> {
    const { workspaceKey, uid, gid, cwd } = credentials
    // Use instance-specific key for multiple workers per workspace
    const workerKey = `${workspaceKey}:${instanceId}`
    const socketPath = getSocketPath(this.config.socketDir, workerKey)

    // Ensure socket directory exists with restricted permissions (only owner can access)
    await mkdir(this.config.socketDir, { recursive: true })
    await chmod(this.config.socketDir, 0o700)

    // Create IPC server before spawning worker
    const ipc = await createIpcServer({
      socketPath,
      onMessage: msg => {
        // Validate message structure before processing
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

    // Spawn worker process
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
        // stdin: ignore (not used), stdout: inherit (avoid pipe buffer blocking), stderr: inherit
        stdio: ["ignore", "inherit", "inherit"],
        detached: false,
      })
    } catch (spawnError) {
      // Clean up IPC server if spawn fails synchronously
      await ipc.close()
      throw spawnError
    }

    const handle: WorkerHandleInternal = {
      process: child,
      socket: null,
      state: "starting",
      workspaceKey: workerKey, // Use workerKey (includes instance) for lookups
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
    }

    // Handle process events
    child.on("exit", (code, signal) => {
      this.handleWorkerExit(workerKey, code, signal)
    })

    child.on("error", err => {
      this.emit("pool:error", { error: err, context: `spawn:${workerKey}` })
      handle.state = "dead"
      // Clean up IPC server on spawn error to prevent resource leak
      handle.ipc?.close()
      this.rejectPendingQueries(handle, `Worker spawn error: ${err.message}`)
    })

    this.workers.set(workerKey, handle)
    this.emit("worker:spawned", { workspaceKey: workerKey, pid: child.pid! })

    // Start eviction timer if not running
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
        worker.state = "ready"
        this.emit("worker:ready", { workspaceKey, pid: worker.process.pid! })
        break
      case "shutdown_ack":
        worker.state = "dead"
        break
      case "health_ok":
        // Health check response - log for debugging
        console.error(
          `[pool] Worker ${workspaceKey} health OK: uptime=${msg.uptime}ms, queries=${msg.queriesProcessed}`,
        )
        break
      case "session":
      case "message":
      case "complete":
      case "error": {
        // Route to the correct pending query by requestId
        // SECURITY: Validate requestId exists and is a string
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
          // Validate sessionId exists
          if (!("sessionId" in msg) || typeof msg.sessionId !== "string") {
            console.error(`[pool] Session message missing sessionId from worker ${workspaceKey}`)
            return
          }
          pending.sessionId = msg.sessionId
          pending.onMessage(msg)
        } else if (msg.type === "message") {
          pending.onMessage(msg)
        } else if (msg.type === "complete") {
          // Validate result exists
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
          const error = new Error(errorMessage)
          // Attach stderr to error for upstream logging
          if (stderr) {
            ;(error as Error & { stderr?: string }).stderr = stderr
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
      // Worker already removed from map (normal during shutdown)
      return
    }

    if (worker.state !== "shutting_down" && worker.state !== "dead") {
      console.error(`[pool] Worker ${workspaceKey} disconnected unexpectedly`)
      worker.state = "dead"
      // Clean up IPC server defensively - exit event should also fire, but be safe
      worker.ipc?.close()
      this.rejectPendingQueries(worker, "Worker disconnected unexpectedly")
    }
  }

  private handleWorkerExit(workspaceKey: string, code: number | null, signal: string | null): void {
    const worker = this.workers.get(workspaceKey)
    if (!worker) {
      // Worker already removed from map (can happen if exit fires after disconnect cleanup)
      return
    }

    // Reject any pending queries
    const exitReason = signal ? `signal ${signal}` : `exit code ${code}`
    this.rejectPendingQueries(worker, `Worker exited: ${exitReason}`)

    // Clean up IPC
    worker.ipc?.close()

    const wasShuttingDown = worker.state === "shutting_down"
    worker.state = "dead"

    if (!wasShuttingDown && !this.isShuttingDown) {
      this.emit("worker:crashed", { workspaceKey, exitCode: code, signal })
    } else {
      this.emit("worker:shutdown", {
        workspaceKey,
        reason: signal ? `signal:${signal}` : `exit:${code}`,
      })
    }

    this.workers.delete(workspaceKey)
  }

  /** Reject all pending queries for a worker (on crash/disconnect) */
  private rejectPendingQueries(worker: WorkerHandleInternal, reason: string): void {
    for (const pending of worker.pendingQueries.values()) {
      pending.cleanup()
      pending.reject(new Error(reason))
    }
    worker.pendingQueries.clear()
  }

  private async waitForReady(worker: WorkerHandleInternal): Promise<void> {
    // Already ready
    if (worker.state === "ready") return

    // Already dead - fail immediately
    if (worker.state === "dead") {
      throw new Error(`Worker ${worker.workspaceKey} died while starting`)
    }

    // Not in starting state - something went wrong
    if (worker.state !== "starting") {
      throw new Error(`Worker ${worker.workspaceKey} in unexpected state: ${worker.state}`)
    }

    // Use event-based waiting instead of busy-loop polling
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup()
        // Clean up the worker that failed to become ready - kill process and close IPC
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

    // Send shutdown message
    this.sendToWorker(worker, { type: "shutdown", graceful: true })

    // Wait for acknowledgment with timeout (event-based, not polling)
    await new Promise<void>(resolve => {
      const timeout = setTimeout(() => {
        cleanup()
        // Force kill on timeout
        worker.process.kill("SIGKILL")
        resolve()
      }, this.config.shutdownTimeoutMs)

      // shutdown_ack message sets state to "dead" in handleWorkerMessage
      // Also handle process exit which triggers handleWorkerExit
      const checkDead = () => {
        if (worker.state === "dead") {
          cleanup()
          resolve()
        }
      }

      // Listen for worker:shutdown event (emitted when worker exits)
      const onShutdown = (event: { workspaceKey: string }) => {
        if (event.workspaceKey === worker.workspaceKey) {
          cleanup()
          resolve()
        }
      }

      const cleanup = () => {
        clearTimeout(timeout)
        this.off("worker:shutdown", onShutdown)
        // Remove interval if we added one
        if (stateCheckInterval) clearInterval(stateCheckInterval)
      }

      this.on("worker:shutdown", onShutdown)

      // Also check state periodically (backup for edge cases) - much less frequent than 100ms
      const stateCheckInterval = setInterval(checkDead, 500)
    })
    // Note: "worker:shutdown" event is already emitted by handleWorkerExit - no need to emit again
  }

  /**
   * Attempt to evict a worker to make room for a new one.
   * @returns true if a worker was evicted, false if all workers are busy
   */
  private async evictWorker(): Promise<boolean> {
    const candidates = Array.from(this.workers.values()).filter(
      w => w.state === "ready", // Only evict idle workers
    )

    if (candidates.length === 0) {
      this.emit("pool:at_capacity", {
        currentWorkers: this.workers.size,
        maxWorkers: this.config.maxWorkers,
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
      // Skip workers that are busy, already shutting down, or not yet ready
      if (worker.state !== "ready") continue

      const inactiveTime = now - worker.lastActivity.getTime()
      const age = now - worker.createdAt.getTime()

      if (inactiveTime > this.config.inactivityTimeoutMs) {
        // Mark as shutting_down immediately (gracefulShutdown does this, but be explicit)
        // The promise runs in background - we don't need to await
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
