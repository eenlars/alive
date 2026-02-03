/**
 * Error utilities adapted from OpenClaw
 *
 * Provides robust error classification for network errors, abort errors,
 * and fatal errors that require different handling strategies.
 */

/**
 * Fatal error codes that should cause immediate process exit.
 */
const FATAL_ERROR_CODES = new Set([
  "ERR_OUT_OF_MEMORY",
  "ERR_SCRIPT_EXECUTION_TIMEOUT",
  "ERR_WORKER_OUT_OF_MEMORY",
  "ERR_WORKER_UNCAUGHT_EXCEPTION",
  "ERR_WORKER_INITIALIZATION_FAILED",
])

/**
 * Configuration error codes that require a fix before continuing.
 */
const CONFIG_ERROR_CODES = new Set(["INVALID_CONFIG", "MISSING_API_KEY", "MISSING_CREDENTIALS"])

/**
 * Transient network error codes that indicate temporary failures.
 * These are typically resolved by retrying and shouldn't crash processes.
 */
const TRANSIENT_NETWORK_CODES = new Set([
  // Standard Node.js error codes
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "ESOCKETTIMEDOUT",
  "ECONNABORTED",
  "EPIPE",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EAI_AGAIN",
  // Undici (Node's native fetch) error codes
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_DNS_RESOLVE_FAILED",
  "UND_ERR_CONNECT",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
])

/**
 * Extract error code from an error object.
 * Handles Node.js style errors with 'code' property.
 */
export function extractErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object") {
    return undefined
  }
  const code = (err as { code?: unknown }).code
  if (typeof code === "string") {
    return code
  }
  return undefined
}

/**
 * Get the cause of an error if it exists.
 */
function getErrorCause(err: unknown): unknown {
  if (!err || typeof err !== "object") {
    return undefined
  }
  return (err as { cause?: unknown }).cause
}

/**
 * Extract error code, checking cause chain.
 */
function extractErrorCodeWithCause(err: unknown): string | undefined {
  const direct = extractErrorCode(err)
  if (direct) {
    return direct
  }
  return extractErrorCode(getErrorCause(err))
}

/**
 * Checks if an error is an AbortError.
 * These are typically intentional cancellations (e.g., during shutdown, user cancel).
 */
export function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") {
    return false
  }
  const name = "name" in err ? String(err.name) : ""
  if (name === "AbortError") {
    return true
  }
  // Check for "This operation was aborted" message from Node's undici
  const message = "message" in err && typeof err.message === "string" ? err.message : ""
  if (message === "This operation was aborted") {
    return true
  }
  return false
}

/**
 * Checks if an error is a fatal error that should cause process exit.
 */
export function isFatalError(err: unknown): boolean {
  const code = extractErrorCodeWithCause(err)
  return code !== undefined && FATAL_ERROR_CODES.has(code)
}

/**
 * Checks if an error is a configuration error that requires a fix.
 */
export function isConfigError(err: unknown): boolean {
  const code = extractErrorCodeWithCause(err)
  return code !== undefined && CONFIG_ERROR_CODES.has(code)
}

/**
 * Checks if an error is a transient network error that shouldn't crash the process.
 * These are typically temporary connectivity issues that will resolve on their own.
 *
 * Use this to:
 * - Decide whether to retry an operation
 * - Suppress crash on unhandled rejection
 * - Log as warning instead of error
 */
export function isTransientNetworkError(err: unknown): boolean {
  if (!err) {
    return false
  }

  const code = extractErrorCodeWithCause(err)
  if (code && TRANSIENT_NETWORK_CODES.has(code)) {
    return true
  }

  // "fetch failed" TypeError from undici (Node's native fetch)
  if (err instanceof TypeError && err.message === "fetch failed") {
    const cause = getErrorCause(err)
    if (cause) {
      return isTransientNetworkError(cause)
    }
    return true
  }

  // Check the cause chain recursively
  const cause = getErrorCause(err)
  if (cause && cause !== err) {
    return isTransientNetworkError(cause)
  }

  // AggregateError may wrap multiple causes
  if (err instanceof AggregateError && err.errors?.length) {
    return err.errors.some(e => isTransientNetworkError(e))
  }

  return false
}

/**
 * Format an error for logging.
 */
export function formatUncaughtError(err: unknown): string {
  if (err instanceof Error) {
    return err.stack ?? err.message
  }
  if (typeof err === "string") {
    return err
  }
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

/**
 * Checks if an error is retryable based on its characteristics.
 * Combines transient network checks with HTTP status code checks.
 */
export function isRetryableNetworkError(err: unknown): boolean {
  // Transient network errors are always retryable
  if (isTransientNetworkError(err)) {
    return true
  }

  // AbortErrors are never retryable (intentional cancellation)
  if (isAbortError(err)) {
    return false
  }

  // Check for HTTP status codes
  if (err && typeof err === "object") {
    const status = (err as { status?: number }).status
    if (typeof status === "number") {
      // Retry server errors (5xx) and rate limits (429)
      return status >= 500 || status === 429
    }
  }

  return false
}
