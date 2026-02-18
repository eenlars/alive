export const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
] as const

export const DEFAULT_TIMEOUT = 60_000
export const DEFAULT_MAX_PAGES = 10
export const DEFAULT_BATCH_CONCURRENCY = 5
export const MAX_BATCH_SIZE = 50
export const PAGINATION_SETTLE_MS = 500

// Retry
export const DEFAULT_RETRY_COUNT = 2
export const RETRY_BASE_DELAY_MS = 2_000
export const RETRY_MAX_DELAY_MS = 15_000

// Cloudflare challenge
export const CF_CHALLENGE_WAIT_MS = 10_000
export const CF_CHALLENGE_POLL_MS = 500
