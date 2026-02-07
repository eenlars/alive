/**
 * Stream State Machine
 *
 * Manages the lifecycle of a single Claude stream.
 * States: idle → queued → running → (completed | failed | cancelled | timed_out)
 */

import { STREAM_EVENT_TYPES, STREAM_STATES, type StreamContext, type StreamEvent, type StreamState } from "../types.js"

// Valid state transitions
const VALID_TRANSITIONS: Record<StreamState, StreamState[]> = {
  [STREAM_STATES.IDLE]: [STREAM_STATES.QUEUED, STREAM_STATES.RUNNING],
  [STREAM_STATES.QUEUED]: [STREAM_STATES.RUNNING, STREAM_STATES.CANCELLED],
  [STREAM_STATES.RUNNING]: [
    STREAM_STATES.COMPLETED,
    STREAM_STATES.FAILED,
    STREAM_STATES.CANCELLED,
    STREAM_STATES.TIMED_OUT,
  ],
  // Terminal states - no transitions allowed
  [STREAM_STATES.COMPLETED]: [],
  [STREAM_STATES.FAILED]: [],
  [STREAM_STATES.CANCELLED]: [],
  [STREAM_STATES.TIMED_OUT]: [],
}

export class StreamStateMachine {
  private state: StreamState = STREAM_STATES.IDLE
  private context: StreamContext
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null
  private onStateChange?: (state: StreamState, context: StreamContext) => void

  constructor(
    context: Omit<StreamContext, "messagesEmitted">,
    options?: {
      onStateChange?: (state: StreamState, context: StreamContext) => void
      timeoutMs?: number
    },
  ) {
    this.context = { ...context, messagesEmitted: 0 }
    this.onStateChange = options?.onStateChange

    if (options?.timeoutMs) {
      this.setupTimeout(options.timeoutMs)
    }
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  get currentState(): StreamState {
    return this.state
  }

  get currentContext(): Readonly<StreamContext> {
    return this.context
  }

  isTerminal(): boolean {
    return VALID_TRANSITIONS[this.state].length === 0
  }

  canTransitionTo(target: StreamState): boolean {
    return VALID_TRANSITIONS[this.state].includes(target)
  }

  // ===========================================================================
  // State Transitions
  // ===========================================================================

  /**
   * Move to queued state (waiting for worker slot)
   */
  queue(): boolean {
    return this.transition(STREAM_STATES.QUEUED)
  }

  /**
   * Start running (worker acquired)
   */
  start(): boolean {
    const success = this.transition(STREAM_STATES.RUNNING)
    if (success) {
      this.context.startedAt = Date.now()
    }
    return success
  }

  /**
   * Mark as completed successfully
   */
  complete(): boolean {
    this.clearTimeout()
    const success = this.transition(STREAM_STATES.COMPLETED)
    if (success) {
      this.context.finishedAt = Date.now()
    }
    return success
  }

  /**
   * Mark as failed with error
   */
  fail(error: string): boolean {
    this.clearTimeout()
    const success = this.transition(STREAM_STATES.FAILED)
    if (success) {
      this.context.error = error
      this.context.finishedAt = Date.now()
    }
    return success
  }

  /**
   * Mark as cancelled by user
   */
  cancel(): boolean {
    this.clearTimeout()
    const success = this.transition(STREAM_STATES.CANCELLED)
    if (success) {
      this.context.finishedAt = Date.now()
    }
    return success
  }

  /**
   * Mark as timed out
   */
  timeout(): boolean {
    this.clearTimeout()
    const success = this.transition(STREAM_STATES.TIMED_OUT)
    if (success) {
      this.context.error = "Stream timed out"
      this.context.finishedAt = Date.now()
    }
    return success
  }

  /**
   * Record a message was emitted
   */
  recordMessage(): void {
    this.context.messagesEmitted++
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.clearTimeout()
  }

  // ===========================================================================
  // Event Creation Helpers
  // ===========================================================================

  createEvent(type: (typeof STREAM_EVENT_TYPES)[keyof typeof STREAM_EVENT_TYPES], extra?: object): StreamEvent {
    const base = {
      requestId: this.context.requestId,
      tabId: this.context.tabId,
      timestamp: Date.now(),
    }

    switch (type) {
      case STREAM_EVENT_TYPES.START:
        return { ...base, type: STREAM_EVENT_TYPES.START }
      case STREAM_EVENT_TYPES.COMPLETE:
        return { ...base, type: STREAM_EVENT_TYPES.COMPLETE, ...extra }
      case STREAM_EVENT_TYPES.ERROR:
        return {
          ...base,
          type: STREAM_EVENT_TYPES.ERROR,
          error: this.context.error ?? "Unknown error",
          ...extra,
        }
      case STREAM_EVENT_TYPES.INTERRUPT:
        return {
          ...base,
          type: STREAM_EVENT_TYPES.INTERRUPT,
          reason: this.state === STREAM_STATES.TIMED_OUT ? "timeout" : "cancelled",
        }
      default:
        throw new Error(`Cannot create event of type ${type} without data`)
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private transition(target: StreamState): boolean {
    if (!this.canTransitionTo(target)) {
      console.error(`[StateMachine ${this.context.requestId}] Invalid transition: ${this.state} → ${target}`)
      return false
    }

    const previous = this.state
    this.state = target

    console.error(`[StateMachine ${this.context.requestId}] ${previous} → ${target}`)

    this.onStateChange?.(this.state, this.context)
    return true
  }

  private setupTimeout(ms: number): void {
    this.timeoutTimer = setTimeout(() => {
      if (this.state === STREAM_STATES.RUNNING) {
        this.timeout()
      }
    }, ms)
  }

  private clearTimeout(): void {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer)
      this.timeoutTimer = null
    }
  }
}
