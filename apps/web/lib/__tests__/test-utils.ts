/**
 * E2E Test Utilities
 *
 * Provides reliable, non-flaky utilities for testing async operations.
 * These utilities poll actual state instead of using fixed timeouts.
 *
 * Key principles:
 * 1. NEVER use fixed timeouts (setTimeout with arbitrary delay)
 * 2. ALWAYS poll actual state until condition is met
 * 3. FAIL FAST with clear error messages
 * 4. Provide debug output on failure
 */

/**
 * Wait for a condition to become true by polling.
 *
 * This is the core utility that replaces flaky fixed timeouts like:
 *   `await new Promise(r => setTimeout(r, 3000))` // BAD - arbitrary wait
 *
 * With proper state polling:
 *   `await waitFor(() => getWorkerState() === 'idle')` // GOOD - actual condition
 *
 * @param condition - Function that returns true when condition is met (can be async)
 * @param options - Configuration for timeout, interval, and error message
 * @throws Error if condition not met within timeout
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: {
    timeout: number
    interval?: number
    message?: string
    debug?: () => string | Promise<string>
  },
): Promise<void> {
  const { timeout, interval = 50, message, debug } = options
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    const result = await condition()
    if (result) return

    await sleep(interval)
  }

  // Condition not met - build detailed error message
  let errorMsg = message ?? `Condition not met within ${timeout}ms`

  if (debug) {
    const debugInfo = await debug()
    errorMsg += `\n\nDebug state:\n${debugInfo}`
  }

  throw new Error(errorMsg)
}

/**
 * Simple sleep utility. Use sparingly - prefer waitFor() for most cases.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Debug state response from /api/debug/locks endpoint
 */
export interface DebugState {
  timestamp: string
  locks: {
    count: number
    keys: Array<{ key: string; ageMs: number }>
  }
  cancellationRegistry: {
    count: number
    entries: Array<{
      requestId: string
      userId: string
      conversationKey: string
      ageMs: number
    }>
  }
  workerPool: {
    enabled: boolean
    stats?: {
      totalWorkers: number
      activeWorkers: number
      idleWorkers: number
      maxWorkers: number
    }
    workers?: Array<{
      workspaceKey: string
      state: string
      isActive: boolean
      queriesProcessed: number
      ageMs: number
      idleMs: number
    }>
  }
}

/**
 * Fetch current debug state from the server.
 * This is the source of truth for all concurrency primitives.
 */
export async function fetchDebugState(baseUrl: string, sessionCookie: string): Promise<DebugState> {
  const res = await fetch(`${baseUrl}/api/debug/locks`, {
    headers: { Cookie: sessionCookie },
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch debug state: ${res.status}`)
  }

  return res.json()
}

/**
 * Wait until all concurrency primitives are clean (no locks, no busy workers).
 * This is the proper way to wait after a cancellation instead of arbitrary delays.
 */
export async function waitForCleanState(
  baseUrl: string,
  sessionCookie: string,
  options?: { timeout?: number; label?: string },
): Promise<void> {
  const timeout = options?.timeout ?? 5000
  const label = options?.label ?? "clean state"

  await waitFor(
    async () => {
      const state = await fetchDebugState(baseUrl, sessionCookie)
      const locksClean = state.locks.count === 0
      const registryClean = state.cancellationRegistry.count === 0
      const workersIdle =
        !state.workerPool.enabled || !state.workerPool.stats || state.workerPool.stats.activeWorkers === 0

      return locksClean && registryClean && workersIdle
    },
    {
      timeout,
      interval: 100,
      message: `Timeout waiting for ${label}`,
      debug: async () => {
        const state = await fetchDebugState(baseUrl, sessionCookie)
        return JSON.stringify(state, null, 2)
      },
    },
  )
}

/**
 * Wait until a specific worker is idle (not busy).
 */
export async function waitForWorkerIdle(
  baseUrl: string,
  sessionCookie: string,
  workspaceKey: string,
  options?: { timeout?: number },
): Promise<void> {
  const timeout = options?.timeout ?? 5000

  await waitFor(
    async () => {
      const state = await fetchDebugState(baseUrl, sessionCookie)
      if (!state.workerPool.enabled || !state.workerPool.workers) {
        return true // No worker pool = always "idle"
      }

      const worker = state.workerPool.workers.find(w => w.workspaceKey === workspaceKey)
      if (!worker) {
        return true // Worker doesn't exist = idle
      }

      return worker.state === "ready" && !worker.isActive
    },
    {
      timeout,
      interval: 50,
      message: `Timeout waiting for worker ${workspaceKey} to become idle`,
      debug: async () => {
        const state = await fetchDebugState(baseUrl, sessionCookie)
        const worker = state.workerPool.workers?.find(w => w.workspaceKey === workspaceKey)
        return JSON.stringify(
          {
            worker: worker ?? "not found",
            stats: state.workerPool.stats,
          },
          null,
          2,
        )
      },
    },
  )
}

/**
 * Wait until conversation lock is released.
 */
export async function waitForLockRelease(
  baseUrl: string,
  sessionCookie: string,
  options?: { timeout?: number },
): Promise<void> {
  const timeout = options?.timeout ?? 5000

  await waitFor(
    async () => {
      const state = await fetchDebugState(baseUrl, sessionCookie)
      return state.locks.count === 0
    },
    {
      timeout,
      interval: 50,
      message: "Timeout waiting for lock release",
      debug: async () => {
        const state = await fetchDebugState(baseUrl, sessionCookie)
        return JSON.stringify(state.locks, null, 2)
      },
    },
  )
}

/**
 * Stream event collected during a test
 */
export interface StreamEvent {
  type: string
  requestId?: string
  timestamp?: string
  data?: unknown
}

/**
 * Collect all events from a stream, optionally failing on errors.
 */
export async function collectStreamEvents(
  response: Response,
  options?: { failOnError?: boolean },
): Promise<StreamEvent[]> {
  const failOnError = options?.failOnError ?? true
  const events: StreamEvent[] = []

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error("No response body")
  }

  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""

      for (const line of lines) {
        if (!line.trim()) continue

        try {
          const event: StreamEvent = JSON.parse(line)
          events.push(event)

          if (failOnError && event.type === "stream_error") {
            throw new Error(`Stream error: ${JSON.stringify(event.data)}`)
          }
        } catch (e) {
          if (e instanceof SyntaxError) {
            console.warn(`Failed to parse stream line: ${line}`)
          } else {
            throw e
          }
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      try {
        const event: StreamEvent = JSON.parse(buffer)
        events.push(event)

        if (failOnError && event.type === "stream_error") {
          throw new Error(`Stream error: ${JSON.stringify(event.data)}`)
        }
      } catch (e) {
        if (!(e instanceof SyntaxError)) {
          throw e
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  return events
}

/**
 * Assert that a stream response has no errors
 */
export function assertNoStreamErrors(events: StreamEvent[]): void {
  const errors = events.filter(e => e.type === "stream_error")
  if (errors.length > 0) {
    throw new Error(`Stream contained ${errors.length} error(s):\n${JSON.stringify(errors, null, 2)}`)
  }
}

/**
 * Extract text content from stream events.
 * Works with both stream_message assistant responses and raw text blocks.
 *
 * Event structure for assistant messages:
 *   event.type = "stream_message" | "message"
 *   event.data.messageType = "assistant"
 *   event.data.content.message.content = [{ type: "text", text: "..." }, ...]
 */
export function extractTextFromEvents(events: StreamEvent[]): string {
  let text = ""

  for (const event of events) {
    if (event.type === "stream_message" || event.type === "message") {
      const data = event.data as {
        messageType?: string
        content?: {
          message?: {
            content?: Array<{ type: string; text?: string }>
          }
        }
      }

      // Assistant messages have content.message.content structure
      if (data.messageType === "assistant" && data.content?.message?.content) {
        for (const block of data.content.message.content) {
          if (block.type === "text" && block.text) {
            text += block.text
          }
        }
      }
    }
  }

  return text
}
