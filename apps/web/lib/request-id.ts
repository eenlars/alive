/**
 * Request ID — single source of truth.
 *
 * The Next.js middleware (middleware.ts) guarantees every /api/* request
 * carries an X-Request-Id header. Route handlers read it via getRequestId().
 */

export const REQUEST_ID_HEADER = "x-request-id"

/**
 * Generate a globally-unique request identifier (UUIDv4).
 */
export function generateRequestId(): string {
  return crypto.randomUUID()
}

/**
 * Read the request ID that the middleware injected.
 *
 * Falls back to generating a new one so callers never get undefined
 * (e.g. when called outside the middleware path).
 */
export function getRequestId(request: Request): string {
  return request.headers.get(REQUEST_ID_HEADER) || generateRequestId()
}
