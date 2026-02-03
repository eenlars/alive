/**
 * Retry utility with exponential backoff, jitter, and custom retry conditions.
 * Based on OpenClaw's implementation.
 */

export type RetryConfig = {
  /** Number of retry attempts (default: 3) */
  attempts?: number
  /** Minimum delay between retries in ms (default: 300) */
  minDelayMs?: number
  /** Maximum delay between retries in ms (default: 30000) */
  maxDelayMs?: number
  /** Jitter factor 0-1 to randomize delays (default: 0) */
  jitter?: number
}

export type RetryInfo = {
  /** Current attempt number (1-based) */
  attempt: number
  /** Maximum number of attempts */
  maxAttempts: number
  /** Delay before next retry in ms */
  delayMs: number
  /** The error that caused the retry */
  err: unknown
  /** Optional label for logging */
  label?: string
}

export type RetryOptions = RetryConfig & {
  /** Optional label for logging/debugging */
  label?: string
  /** Custom function to determine if error should trigger retry */
  shouldRetry?: (err: unknown, attempt: number) => boolean
  /** Extract retry-after delay from error (e.g., rate limit headers) */
  retryAfterMs?: (err: unknown) => number | undefined
  /** Callback on each retry attempt */
  onRetry?: (info: RetryInfo) => void
}

const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  attempts: 3,
  minDelayMs: 300,
  maxDelayMs: 30_000,
  jitter: 0,
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const asFiniteNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined

const clampNumber = (value: unknown, fallback: number, min?: number, max?: number) => {
  const next = asFiniteNumber(value)
  if (next === undefined) {
    return fallback
  }
  const floor = typeof min === "number" ? min : Number.NEGATIVE_INFINITY
  const ceiling = typeof max === "number" ? max : Number.POSITIVE_INFINITY
  return Math.min(Math.max(next, floor), ceiling)
}

/**
 * Resolve retry config with defaults
 */
export function resolveRetryConfig(
  defaults: Required<RetryConfig> = DEFAULT_RETRY_CONFIG,
  overrides?: RetryConfig,
): Required<RetryConfig> {
  const attempts = Math.max(1, Math.round(clampNumber(overrides?.attempts, defaults.attempts, 1)))
  const minDelayMs = Math.max(0, Math.round(clampNumber(overrides?.minDelayMs, defaults.minDelayMs, 0)))
  const maxDelayMs = Math.max(minDelayMs, Math.round(clampNumber(overrides?.maxDelayMs, defaults.maxDelayMs, 0)))
  const jitter = clampNumber(overrides?.jitter, defaults.jitter, 0, 1)
  return { attempts, minDelayMs, maxDelayMs, jitter }
}

/**
 * Apply jitter to delay
 */
function applyJitter(delayMs: number, jitter: number): number {
  if (jitter <= 0) {
    return delayMs
  }
  const offset = (Math.random() * 2 - 1) * jitter
  return Math.max(0, Math.round(delayMs * (1 + offset)))
}

/**
 * Retry an async function with exponential backoff.
 *
 * @example Simple usage with default options
 * ```ts
 * const result = await retryAsync(() => fetch(url), 3)
 * ```
 *
 * @example Advanced usage with options
 * ```ts
 * const result = await retryAsync(
 *   () => callApi(),
 *   {
 *     attempts: 5,
 *     minDelayMs: 100,
 *     maxDelayMs: 10000,
 *     jitter: 0.2,
 *     label: 'api-call',
 *     shouldRetry: (err) => isRetryableError(err),
 *     onRetry: ({ attempt, delayMs }) => console.log(`Retry ${attempt} in ${delayMs}ms`)
 *   }
 * )
 * ```
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  attemptsOrOptions: number | RetryOptions = 3,
  initialDelayMs = 300,
): Promise<T> {
  // Simple mode: just attempts and initial delay
  if (typeof attemptsOrOptions === "number") {
    const attempts = Math.max(1, Math.round(attemptsOrOptions))
    let lastErr: unknown
    for (let i = 0; i < attempts; i += 1) {
      try {
        return await fn()
      } catch (err) {
        lastErr = err
        if (i === attempts - 1) {
          break
        }
        const delay = initialDelayMs * 2 ** i
        await sleep(delay)
      }
    }
    throw lastErr ?? new Error("Retry failed")
  }

  // Advanced mode: full options
  const options = attemptsOrOptions
  const resolved = resolveRetryConfig(DEFAULT_RETRY_CONFIG, options)
  const maxAttempts = resolved.attempts
  const minDelayMs = resolved.minDelayMs
  const maxDelayMs =
    Number.isFinite(resolved.maxDelayMs) && resolved.maxDelayMs > 0 ? resolved.maxDelayMs : Number.POSITIVE_INFINITY
  const jitter = resolved.jitter
  const shouldRetry = options.shouldRetry ?? (() => true)
  let lastErr: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt >= maxAttempts || !shouldRetry(err, attempt)) {
        break
      }

      // Check for retry-after header/value
      const retryAfterMs = options.retryAfterMs?.(err)
      const hasRetryAfter = typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs)
      const baseDelay = hasRetryAfter ? Math.max(retryAfterMs, minDelayMs) : minDelayMs * 2 ** (attempt - 1)
      let delay = Math.min(baseDelay, maxDelayMs)
      delay = applyJitter(delay, jitter)
      delay = Math.min(Math.max(delay, minDelayMs), maxDelayMs)

      options.onRetry?.({
        attempt,
        maxAttempts,
        delayMs: delay,
        err,
        label: options.label,
      })
      await sleep(delay)
    }
  }

  throw lastErr ?? new Error("Retry failed")
}

/**
 * Backoff policy configuration
 */
export type BackoffPolicy = {
  initialMs: number
  maxMs: number
  factor: number
  jitter: number
}

/**
 * Compute backoff delay for a given attempt
 */
export function computeBackoff(policy: BackoffPolicy, attempt: number): number {
  const base = policy.initialMs * policy.factor ** Math.max(attempt - 1, 0)
  const jitterAmount = base * policy.jitter * Math.random()
  return Math.min(policy.maxMs, Math.round(base + jitterAmount))
}

/**
 * Sleep with abort signal support
 */
export async function sleepWithAbort(ms: number, abortSignal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms)
    if (abortSignal) {
      if (abortSignal.aborted) {
        clearTimeout(timeout)
        reject(new Error("aborted"))
        return
      }
      abortSignal.addEventListener(
        "abort",
        () => {
          clearTimeout(timeout)
          reject(new Error("aborted"))
        },
        { once: true },
      )
    }
  })
}
