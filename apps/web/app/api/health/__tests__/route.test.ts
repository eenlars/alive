/**
 * Tests for GET /api/health endpoint
 *
 * This endpoint provides health status for monitoring and alerting.
 * It checks Redis and database connectivity.
 *
 * Required tests:
 * - Happy path: all services connected
 * - Degraded: one service has issues
 * - Unhealthy: services disconnected
 * - Response structure validation
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Mock Redis client
vi.mock("@webalive/redis", () => ({
  createRedisClient: vi.fn(() => ({
    ping: vi.fn(),
    status: "ready",
  })),
}))

// Mock Supabase client (not used by health route, but kept for reference)
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => Promise.resolve({ error: null })),
    })),
  })),
}))

// Mock global fetch for database health checks (health route uses direct fetch)
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// Mock env functions
vi.mock("@/lib/env/server", () => ({
  getSupabaseCredentials: vi.fn(() => ({
    url: "https://test.supabase.co",
    key: "test-key",
  })),
}))

vi.mock("@webalive/env/server", () => ({
  env: {
    get BRIDGE_ENV() {
      return process.env.BRIDGE_ENV
    },
  },
  getRedisUrl: vi.fn(() => "redis://localhost:6379"),
}))

// Import after mocking
const { GET, _resetHealthCheckRedis } = await import("../route")
const { createRedisClient } = await import("@webalive/redis")
// createClient no longer used - health route uses direct fetch

// Type helpers for mocks - cast partial mocks to satisfy full type requirements
type MockRedis = ReturnType<typeof createRedisClient>
// MockSupabase unused after refactoring to mockFetch

function mockRedis(overrides: { ping: ReturnType<typeof vi.fn>; status: string }): MockRedis {
  return overrides as unknown as MockRedis
}

// Unused after refactoring to use mockFetch
// function mockSupabase(overrides: { from: ReturnType<typeof vi.fn> }): MockSupabase {
//   return overrides as unknown as MockSupabase
// }

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset singleton before each test so mocks take effect
    _resetHealthCheckRedis()
    // Reset fetch mock
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe("Happy Path - All Services Connected", () => {
    it("should return 200 when all services are healthy", async () => {
      // Setup: Redis connected
      vi.mocked(createRedisClient).mockReturnValue(
        mockRedis({
          ping: vi.fn().mockResolvedValue("PONG"),
          status: "ready",
        }),
      )

      // Setup: Database connected (via fetch mock)
      mockFetch.mockResolvedValue(new Response(JSON.stringify([{ user_id: "test" }]), { status: 200 }))

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.status).toBe("healthy")
    })

    it("should return correct response structure", async () => {
      vi.mocked(createRedisClient).mockReturnValue(
        mockRedis({
          ping: vi.fn().mockResolvedValue("PONG"),
          status: "ready",
        }),
      )

      // Database connected via fetch mock
      mockFetch.mockResolvedValue(new Response(JSON.stringify([{ user_id: "test" }]), { status: 200 }))

      const response = await GET()
      const data = await response.json()

      // Check top-level structure
      expect(data).toHaveProperty("status")
      expect(data).toHaveProperty("services")
      expect(data).toHaveProperty("system")
      expect(data).toHaveProperty("timestamp")
      expect(data).toHaveProperty("responseTimeMs")

      // Check services structure
      expect(data.services).toHaveProperty("redis")
      expect(data.services).toHaveProperty("database")

      // Check Redis service structure
      expect(data.services.redis).toHaveProperty("status")
      expect(data.services.redis).toHaveProperty("responseTimeMs")
      expect(typeof data.services.redis.responseTimeMs).toBe("number")

      // Check database service structure
      expect(data.services.database).toHaveProperty("status")
      expect(data.services.database).toHaveProperty("responseTimeMs")
      expect(typeof data.services.database.responseTimeMs).toBe("number")

      // Check system structure
      expect(data.system).toHaveProperty("uptime")
      expect(data.system).toHaveProperty("memory")
      expect(data.system).toHaveProperty("nodeVersion")
      expect(data.system.memory).toHaveProperty("used")
      expect(data.system.memory).toHaveProperty("total")
      expect(data.system.memory).toHaveProperty("percentUsed")

      // Check timestamp is valid ISO string
      expect(() => new Date(data.timestamp)).not.toThrow()
      expect(new Date(data.timestamp).toISOString()).toBe(data.timestamp)

      // Check responseTimeMs is a number
      expect(typeof data.responseTimeMs).toBe("number")
      expect(data.responseTimeMs).toBeGreaterThanOrEqual(0)
    })

    it("should show Redis details when connected", async () => {
      vi.mocked(createRedisClient).mockReturnValue(
        mockRedis({
          ping: vi.fn().mockResolvedValue("PONG"),
          status: "ready",
        }),
      )

      // Database connected via fetch mock
      mockFetch.mockResolvedValue(new Response(JSON.stringify([{ user_id: "test" }]), { status: 200 }))

      const response = await GET()
      const data = await response.json()

      expect(data.services.redis.status).toBe("connected")
      expect(data.services.redis.details).toBeDefined()
      expect(data.services.redis.details.state).toBe("ready")
    })
  })

  describe("Unhealthy - Services Disconnected", () => {
    it("should return 503 when Redis client is unavailable outside standalone mode", async () => {
      vi.stubEnv("BRIDGE_ENV", "production")
      vi.mocked(createRedisClient).mockReturnValue(null as unknown as MockRedis)
      mockFetch.mockResolvedValue(new Response(JSON.stringify([{ user_id: "test" }]), { status: 200 }))

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(503)
      expect(data.status).toBe("unhealthy")
      expect(data.services.redis.status).toBe("disconnected")
      expect(data.services.redis.details.mode).toBe("missing")
    })

    it("should return 503 when Redis is disconnected", async () => {
      vi.mocked(createRedisClient).mockReturnValue(
        mockRedis({
          ping: vi.fn().mockRejectedValue(new Error("Connection refused")),
          status: "end",
        }),
      )

      // Database connected via fetch mock
      mockFetch.mockResolvedValue(new Response(JSON.stringify([{ user_id: "test" }]), { status: 200 }))

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(503)
      expect(data.status).toBe("unhealthy")
      expect(data.services.redis.status).toBe("disconnected")
      expect(data.services.redis.error).toBe("Connection refused")
    })

    it("should return 503 when database is disconnected", async () => {
      vi.mocked(createRedisClient).mockReturnValue(
        mockRedis({
          ping: vi.fn().mockResolvedValue("PONG"),
          status: "ready",
        }),
      )

      // Database disconnected via fetch mock (network error)
      mockFetch.mockRejectedValue(new Error("Database connection failed"))

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(503)
      expect(data.status).toBe("unhealthy")
      expect(data.services.database.status).toBe("disconnected")
      expect(data.services.database.error).toBe("Database connection failed")
    })

    it("should return 503 when both services are disconnected", async () => {
      vi.mocked(createRedisClient).mockReturnValue(
        mockRedis({
          ping: vi.fn().mockRejectedValue(new Error("Redis error")),
          status: "end",
        }),
      )

      // Database disconnected via fetch mock (network error)
      mockFetch.mockRejectedValue(new Error("Database error"))

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(503)
      expect(data.status).toBe("unhealthy")
      expect(data.services.redis.status).toBe("disconnected")
      expect(data.services.database.status).toBe("disconnected")
    })
  })

  describe("Degraded - Service Errors", () => {
    it("should return degraded when Redis returns unexpected response", async () => {
      vi.mocked(createRedisClient).mockReturnValue(
        mockRedis({
          ping: vi.fn().mockResolvedValue("UNEXPECTED"),
          status: "ready",
        }),
      )

      // Database connected via fetch mock
      mockFetch.mockResolvedValue(new Response(JSON.stringify([{ user_id: "test" }]), { status: 200 }))

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(200) // Not 503 because it's degraded, not disconnected
      expect(data.status).toBe("degraded")
      expect(data.services.redis.status).toBe("error")
      expect(data.services.redis.error).toContain("Unexpected ping response")
    })

    it("should return degraded when database query has error", async () => {
      vi.mocked(createRedisClient).mockReturnValue(
        mockRedis({
          ping: vi.fn().mockResolvedValue("PONG"),
          status: "ready",
        }),
      )

      // Database error (query failed, not disconnected) via fetch mock
      mockFetch.mockResolvedValue(new Response(JSON.stringify({ message: "Query failed" }), { status: 400 }))

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(200) // Not 503 because it's degraded, not disconnected
      expect(data.status).toBe("degraded")
      expect(data.services.database.status).toBe("error")
      expect(data.services.database.error).toBe("Query failed")
    })
  })

  describe("Standalone Mode", () => {
    it("should treat missing Redis as connected in standalone mode", async () => {
      vi.stubEnv("BRIDGE_ENV", "standalone")
      vi.mocked(createRedisClient).mockReturnValue(null as unknown as MockRedis)
      mockFetch.mockResolvedValue(new Response(JSON.stringify([{ user_id: "test" }]), { status: 200 }))

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.services.redis.status).toBe("connected")
      expect(data.services.redis.details.mode).toBe("standalone")
    })
  })

  describe("Cache Headers", () => {
    it("should set no-cache headers", async () => {
      vi.mocked(createRedisClient).mockReturnValue(
        mockRedis({
          ping: vi.fn().mockResolvedValue("PONG"),
          status: "ready",
        }),
      )

      // Database connected via fetch mock
      mockFetch.mockResolvedValue(new Response(JSON.stringify([{ user_id: "test" }]), { status: 200 }))

      const response = await GET()

      expect(response.headers.get("Cache-Control")).toBe("no-store, no-cache, must-revalidate")
    })
  })

  describe("System Information", () => {
    it("should include valid system information", async () => {
      vi.mocked(createRedisClient).mockReturnValue(
        mockRedis({
          ping: vi.fn().mockResolvedValue("PONG"),
          status: "ready",
        }),
      )

      // Database connected via fetch mock
      mockFetch.mockResolvedValue(new Response(JSON.stringify([{ user_id: "test" }]), { status: 200 }))

      const response = await GET()
      const data = await response.json()

      // System uptime should be a positive number
      expect(data.system.uptime).toBeGreaterThanOrEqual(0)

      // Memory values should be positive numbers
      expect(data.system.memory.used).toBeGreaterThan(0)
      expect(data.system.memory.total).toBeGreaterThan(0)
      expect(data.system.memory.percentUsed).toBeGreaterThan(0)
      expect(data.system.memory.percentUsed).toBeLessThanOrEqual(100)

      // Node version should start with 'v'
      expect(data.system.nodeVersion).toMatch(/^v\d+/)
    })
  })
})
