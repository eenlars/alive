/**
 * Test Constants for E2E Tests
 *
 * Centralized constants for API endpoints, patterns, and expected values.
 * This ensures tests are change-resistant and maintainable.
 */

/**
 * API endpoints used in tests
 */
export const TEST_API = {
  CLAUDE_STREAM: "/api/claude/stream",
  CLAUDE_POLLING: "/api/claude",
  LOGIN: "/api/login",
  VERIFY: "/api/verify",
} as const

/**
 * Expected model names
 */
export const TEST_MODELS = {
  HAIKU: "claude-haiku-4-5",
  SONNET: "claude-sonnet-4",
} as const

/**
 * Regular expression patterns for validation
 */
export const PATTERNS = {
  /** UUID v4 format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx */
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  /** Email format */
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
} as const

/**
 * Test messages for different scenarios
 */
export const TEST_MESSAGES = {
  SIMPLE: "test message",
  GREETING: "Hello",
  QUESTION: "What can you help me with?",
} as const

/**
 * Expected HTTP status codes
 */
export const HTTP_STATUS = {
  OK: 200,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
} as const
