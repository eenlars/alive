/**
 * Request-scoped logger for consistent logging across API routes
 * DRY refactor: Eliminates repeated "[Service requestId]" prefix patterns
 */

export interface RequestLogger {
  log: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
}

/**
 * Create a request-scoped logger with automatic prefix
 *
 * @param service - Service name (e.g., "Claude Stream", "Manager", "Login")
 * @param requestId - Unique request identifier
 * @returns Logger with prefixed methods
 *
 * @example
 * const logger = createRequestLogger("Claude Stream", requestId)
 * logger.log("Starting request")  // [Claude Stream abc-123] Starting request
 * logger.error("Failed:", err)    // [Claude Stream abc-123] Failed: Error...
 */
export function createRequestLogger(service: string, requestId: string): RequestLogger {
  const prefix = `[${service} ${requestId}]`

  return {
    log: (...args: unknown[]) => console.log(prefix, ...args),
    error: (...args: unknown[]) => console.error(prefix, ...args),
    warn: (...args: unknown[]) => console.warn(prefix, ...args),
    info: (...args: unknown[]) => console.log(prefix, ...args),
  }
}

/**
 * Create a simple logger with just a service prefix (no request ID)
 *
 * @param service - Service name
 * @returns Logger with service prefix
 *
 * @example
 * const logger = createServiceLogger("Manager")
 * logger.log("Action completed")  // [Manager] Action completed
 */
export function createServiceLogger(service: string): RequestLogger {
  const prefix = `[${service}]`

  return {
    log: (...args: unknown[]) => console.log(prefix, ...args),
    error: (...args: unknown[]) => console.error(prefix, ...args),
    warn: (...args: unknown[]) => console.warn(prefix, ...args),
    info: (...args: unknown[]) => console.log(prefix, ...args),
  }
}
