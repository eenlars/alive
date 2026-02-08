/**
 * Stream Manager
 *
 * Manages all active streams with:
 * - Concurrency limits (global, per-org, per-user)
 * - Queue management
 * - Stream lifecycle tracking
 */

import {
  type ConcurrencyConfig,
  DEFAULT_CONCURRENCY,
  STREAM_STATES,
  type StreamContext,
  type StreamState,
} from "../types.js"
import { StreamStateMachine } from "./state-machine.js"

export interface StreamHandle {
  machine: StreamStateMachine
  abortController: AbortController
}

export interface StreamManagerStats {
  activeStreams: number
  queuedStreams: number
  byOrg: Map<string, number>
  byUser: Map<string, number>
}

export class StreamManager {
  private streams = new Map<string, StreamHandle>()
  private config: ConcurrencyConfig

  // Counters for concurrency tracking
  private activeByOrg = new Map<string, number>()
  private activeByUser = new Map<string, number>()

  constructor(config: Partial<ConcurrencyConfig> = {}) {
    this.config = { ...DEFAULT_CONCURRENCY, ...config }
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Check if we can accept a new stream for this org/user
   */
  canAccept(orgId: string, userId: string): { allowed: boolean; reason?: string } {
    // Check global limit
    const activeCount = this.getActiveCount()
    if (activeCount >= this.config.maxGlobal) {
      return { allowed: false, reason: `Global limit reached (${this.config.maxGlobal})` }
    }

    // Check per-org limit
    const orgCount = this.activeByOrg.get(orgId) ?? 0
    if (orgCount >= this.config.maxPerOrg) {
      return { allowed: false, reason: `Org limit reached (${this.config.maxPerOrg})` }
    }

    // Check per-user limit
    const userCount = this.activeByUser.get(userId) ?? 0
    if (userCount >= this.config.maxPerUser) {
      return { allowed: false, reason: `User limit reached (${this.config.maxPerUser})` }
    }

    return { allowed: true }
  }

  /**
   * Create and register a new stream
   */
  createStream(context: Omit<StreamContext, "messagesEmitted">, options?: { timeoutMs?: number }): StreamHandle | null {
    const { requestId, orgId, userId } = context

    // Check if stream already exists
    if (this.streams.has(requestId)) {
      console.error(`[StreamManager] Stream ${requestId} already exists`)
      return null
    }

    // Check concurrency
    const check = this.canAccept(orgId, userId)
    if (!check.allowed) {
      console.error(`[StreamManager] Rejected ${requestId}: ${check.reason}`)
      return null
    }

    // Create state machine
    const machine = new StreamStateMachine(context, {
      timeoutMs: options?.timeoutMs,
      onStateChange: (state, ctx) => this.handleStateChange(requestId, state, ctx),
    })

    // Create abort controller for cancellation
    const abortController = new AbortController()

    const handle: StreamHandle = { machine, abortController }
    this.streams.set(requestId, handle)

    // Update counters
    this.incrementCounter(this.activeByOrg, orgId)
    this.incrementCounter(this.activeByUser, userId)

    return handle
  }

  /**
   * Get a stream by requestId
   */
  getStream(requestId: string): StreamHandle | undefined {
    return this.streams.get(requestId)
  }

  /**
   * Cancel a stream
   */
  cancelStream(requestId: string): boolean {
    const handle = this.streams.get(requestId)
    if (!handle) return false

    // Abort the fetch/worker
    handle.abortController.abort()

    // Transition state machine
    return handle.machine.cancel()
  }

  /**
   * Remove a completed/failed/cancelled stream
   */
  removeStream(requestId: string): void {
    const handle = this.streams.get(requestId)
    if (!handle) return

    const ctx = handle.machine.currentContext

    // Decrement counters
    this.decrementCounter(this.activeByOrg, ctx.orgId)
    this.decrementCounter(this.activeByUser, ctx.userId)

    // Clean up
    handle.machine.dispose()
    this.streams.delete(requestId)
  }

  /**
   * Get manager statistics
   */
  getStats(): StreamManagerStats {
    let activeStreams = 0
    let queuedStreams = 0

    for (const handle of this.streams.values()) {
      const state = handle.machine.currentState
      if (state === STREAM_STATES.RUNNING) activeStreams++
      if (state === STREAM_STATES.QUEUED) queuedStreams++
    }

    return {
      activeStreams,
      queuedStreams,
      byOrg: new Map(this.activeByOrg),
      byUser: new Map(this.activeByUser),
    }
  }

  /**
   * Graceful shutdown - cancel all active streams
   */
  async shutdown(): Promise<void> {
    console.error(`[StreamManager] Shutting down ${this.streams.size} streams`)

    const cancelPromises: Promise<void>[] = []

    for (const [_requestId, handle] of this.streams) {
      if (!handle.machine.isTerminal()) {
        handle.abortController.abort()
        handle.machine.cancel()
      }
      // Give streams a moment to clean up
      cancelPromises.push(new Promise(resolve => setTimeout(resolve, 100)))
    }

    await Promise.all(cancelPromises)

    // Clear everything
    for (const handle of this.streams.values()) {
      handle.machine.dispose()
    }
    this.streams.clear()
    this.activeByOrg.clear()
    this.activeByUser.clear()
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private getActiveCount(): number {
    let count = 0
    for (const handle of this.streams.values()) {
      const state = handle.machine.currentState
      if (state === STREAM_STATES.RUNNING || state === STREAM_STATES.QUEUED) {
        count++
      }
    }
    return count
  }

  private handleStateChange(_requestId: string, state: StreamState, ctx: StreamContext): void {
    // Auto-remove terminal streams after a delay (for debugging/stats)
    if (
      state === STREAM_STATES.COMPLETED ||
      state === STREAM_STATES.FAILED ||
      state === STREAM_STATES.CANCELLED ||
      state === STREAM_STATES.TIMED_OUT
    ) {
      // Remove after 5 seconds to allow stats collection
      setTimeout(() => this.removeStream(ctx.requestId), 5000)
    }
  }

  private incrementCounter(map: Map<string, number>, key: string): void {
    map.set(key, (map.get(key) ?? 0) + 1)
  }

  private decrementCounter(map: Map<string, number>, key: string): void {
    const current = map.get(key) ?? 0
    if (current <= 1) {
      map.delete(key)
    } else {
      map.set(key, current - 1)
    }
  }
}

// Singleton instance
let instance: StreamManager | null = null

export function getStreamManager(config?: Partial<ConcurrencyConfig>): StreamManager {
  if (!instance) {
    instance = new StreamManager(config)
  }
  return instance
}

export function resetStreamManager(): void {
  if (instance) {
    instance.shutdown()
    instance = null
  }
}
