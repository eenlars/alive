/**
 * Shared fetch utility with retry logic for OAuth providers
 *
 * Uses @webalive/shared retryAsync for consistent retry behavior across all providers.
 * Only retries on transient failures (5xx, network errors), not on client errors (4xx).
 */

import { isRetryableNetworkError, retryAsync } from "@webalive/shared"

export interface FetchWithRetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number
  /** Minimum delay between retries in ms (default: 1000) */
  minDelayMs?: number
  /** Maximum delay between retries in ms (default: 10000) */
  maxDelayMs?: number
  /** Jitter factor 0-1 to randomize delays (default: 0.1) */
  jitter?: number
  /** Label for logging (default: "OAuth") */
  label?: string
}

/**
 * Determines if an error or response should trigger a retry
 *
 * Retries on:
 * - Network errors (connection refused, timeout, etc.)
 * - Server errors (5xx)
 *
 * Does NOT retry on:
 * - Client errors (4xx) - these are intentional failures
 * - Successful responses
 */
function shouldRetryFetch(error: unknown): boolean {
  // Network-level errors (no response received)
  if (isRetryableNetworkError(error)) {
    return true
  }

  // Check if it's a FetchRetryError with status code
  if (error instanceof FetchRetryError) {
    // Only retry server errors (5xx)
    return error.status >= 500 && error.status < 600
  }

  return false
}

/**
 * Custom error class to carry HTTP status through retry logic
 */
export class FetchRetryError extends Error {
  readonly status: number
  readonly response: Response

  constructor(message: string, status: number, response: Response) {
    super(message)
    this.name = "FetchRetryError"
    this.status = status
    this.response = response
  }
}

/**
 * Fetch with exponential backoff retry for transient failures
 *
 * @param url - URL to fetch
 * @param options - Fetch options (method, headers, body, etc.)
 * @param retryOptions - Retry configuration
 * @returns Response object
 * @throws FetchRetryError if all retries exhausted
 *
 * @example
 * ```typescript
 * const res = await fetchWithRetry("https://api.example.com/token", {
 *   method: "POST",
 *   headers: { "Content-Type": "application/x-www-form-urlencoded" },
 *   body: params.toString(),
 * }, { label: "Linear" })
 * ```
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retryOptions: FetchWithRetryOptions = {},
): Promise<Response> {
  const { maxRetries = 3, minDelayMs = 1000, maxDelayMs = 10000, jitter = 0.1, label = "OAuth" } = retryOptions

  return retryAsync(
    async () => {
      const res = await fetch(url, options)

      // Don't retry client errors (4xx) - return as-is for caller to handle
      if (res.ok || res.status < 500) {
        return res
      }

      // Server error - throw to trigger retry
      throw new FetchRetryError(`HTTP ${res.status}: ${res.statusText}`, res.status, res)
    },
    {
      attempts: maxRetries,
      minDelayMs,
      maxDelayMs,
      jitter,
      label: `${label}:fetch`,
      shouldRetry: shouldRetryFetch,
      onRetry: ({ attempt, maxAttempts, delayMs, err }) => {
        const status = err instanceof FetchRetryError ? err.status : "network"
        console.log(`[${label}] Retry ${attempt}/${maxAttempts} after ${delayMs}ms (${status})`)
      },
    },
  )
}
