/**
 * Stream token types for authentication between Next.js and Broker.
 *
 * Token flow:
 * 1. Client requests token from Next.js (POST /api/stream-token)
 * 2. Next.js verifies session, mints signed token
 * 3. Client uses token to authenticate with Broker
 * 4. Broker verifies signature and expiry
 */

/**
 * Token payload structure (signed with HMAC-SHA256)
 *
 * Format: base64url(payload).signature
 */
export interface StreamTokenPayload {
  /** User ID (subject) */
  sub: string
  /** Organization ID */
  org: string
  /** Workspace (domain name) */
  ws: string
  /** Tab ID */
  tab: string
  /** Request ID (client-generated idempotency key) */
  rid: string
  /** Expiry timestamp (unix seconds) */
  exp: number
  /** Issued at timestamp (unix seconds) */
  iat: number
  /** Model override (if user has permission) */
  mdl?: string
  /** Conversation context reference (optional) */
  ctx?: string
}

/**
 * Response from POST /api/stream-token
 */
export interface TokenResponse {
  /** Signed stream token */
  token: string
  /** Broker URL to connect to */
  brokerUrl: string
  /** Token expiry timestamp (unix milliseconds) */
  expiresAt: number
}

/**
 * Request to POST /api/stream-token
 */
export interface TokenRequest {
  /** Client-generated request ID (must be unique) */
  requestId: string
  /** Current tab ID */
  tabId: string
  /** Target workspace */
  workspace: string
}

/**
 * Request to POST /v1/streams (broker)
 */
export interface StreamStartRequest {
  /** Conversation messages */
  messages: Array<{
    role: "user" | "assistant"
    content: string
  }>
  /** Model override (validated against token) */
  model?: string
  /** Max tokens to generate */
  maxTokens?: number
  /** Temperature (0-1) */
  temperature?: number
}

/**
 * Response from POST /v1/streams (broker)
 */
export interface StreamStartResponse {
  /** Broker-assigned stream ID */
  streamId: string
  /** Whether this is a new stream or existing (idempotency) */
  status: "started" | "already_exists"
  /** If already_exists, the last sequence number */
  existingSeq?: number
}

/**
 * Response from GET /v1/streams/:id/replay (broker)
 */
export interface ReplayResponse {
  /** Events with seq > after parameter */
  events: unknown[]
  /** Whether the stream has ended */
  ended: boolean
  /** Final state if ended */
  finalState?: "complete" | "interrupted" | "error"
  /** Current sequence number */
  currentSeq: number
}

/**
 * Response from POST /v1/streams/:id/cancel (broker)
 */
export interface CancelResponse {
  /** Cancellation status */
  status: "cancelled" | "already_completed" | "not_found"
  /** Last sequence number */
  lastSeq: number
}

/**
 * Token TTL configuration
 */
export const TOKEN_CONFIG = {
  /** Production token TTL in seconds */
  TTL_PRODUCTION: 60,
  /** Development token TTL in seconds (longer for debugging) */
  TTL_DEVELOPMENT: 300,
  /** Clock skew tolerance in seconds */
  CLOCK_SKEW_TOLERANCE: 60,
} as const
