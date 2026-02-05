import { AsyncLocalStorage } from "node:async_hooks"
import { vi } from "vitest"

process.env.TZ = "UTC"
// Note: NODE_ENV is read-only in some environments, only set if needed
if (process.env.NODE_ENV !== "test") {
  try {
    ;(process.env as Record<string, string>).NODE_ENV = "test"
  } catch {
    // NODE_ENV may be frozen in production builds, ignore
  }
}
process.env.STREAM_ENV = "local"
process.env.SKIP_ENV_VALIDATION = "1" // Skip @t3-oss/env validation in tests

// Mock security credentials for tests
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-unit-tests-only-32chars"
process.env.ALIVE_PASSCODE = process.env.ALIVE_PASSCODE || "test-passcode"

// Mock Supabase credentials for tests (server-side)
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://test.supabase.co"
process.env.SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ0ZXN0Iiwicm9sZSI6ImFub24ifQ.test"
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ0ZXN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSJ9.test"

// Mock Supabase credentials for tests (client-side - NEXT_PUBLIC_)
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://test.supabase.co"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ0ZXN0Iiwicm9sZSI6ImFub24ifQ.test"

if (process.env.CI) {
  process.env.FORCE_COLOR = "0"
}

// AsyncLocalStorage for test request context
const testRequestContext = new AsyncLocalStorage<Request>()

// Export function to run code with request context
export function runWithRequestContext<T>(request: Request, fn: () => T | Promise<T>): Promise<T> {
  return Promise.resolve(testRequestContext.run(request, fn))
}

// Helper to parse cookie strings
function parseCookies(cookieString: string) {
  const cookies = new Map<string, string>()
  for (const pair of cookieString.split(";")) {
    const [key, ...values] = pair.trim().split("=")
    if (key) {
      cookies.set(key, values.join("="))
    }
  }
  return cookies
}

// Mock Next.js cookies() to read from AsyncLocalStorage
vi.mock("next/headers", () => {
  return {
    cookies: async () => {
      const request = testRequestContext.getStore() ?? null
      const cookieHeader = request?.headers?.get("cookie") || ""
      const cookieMap = parseCookies(cookieHeader)

      return {
        getAll: () => Array.from(cookieMap.entries()).map(([name, value]) => ({ name, value })),
        get: (name: string) => {
          const value = cookieMap.get(name)
          return value ? { name, value } : undefined
        },
        set: () => {},
        delete: () => {},
      }
    },
    headers: async () => {
      const request = testRequestContext.getStore() ?? null
      return {
        get: (name: string) => request?.headers?.get(name) || null,
        has: (name: string) => request?.headers?.has(name) || false,
        entries: () => request?.headers?.entries() || [],
      }
    },
  }
})

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(() => {
    throw new Error(
      "🚨 Anthropic SDK query() called in test without mocking!\n" +
        "This would make a REAL API call and cost money.\n\n" +
        "To fix this:\n" +
        "1. Mock the API response in your test\n" +
        "2. Or use route mocking for e2e tests (Playwright)\n" +
        "3. Never call real Anthropic API in unit tests",
    )
  }),
  stream: vi.fn(() => {
    throw new Error("🚨 Anthropic SDK stream() called in test without mocking!")
  }),
}))
