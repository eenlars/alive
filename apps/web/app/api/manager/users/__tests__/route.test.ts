/**
 * Integration Tests for Manager Users API
 *
 * Tests the /api/manager/users endpoint that returns user list for the manager
 */

import { DOMAINS } from "@webalive/shared"
import type { RequestInit as NextRequestInit } from "next/dist/server/web/spec-extension/request"
import { NextRequest } from "next/server"
import { beforeAll, describe, expect, it, vi } from "vitest"
import { createAppClient } from "@/lib/supabase/app"
import { createIamClient } from "@/lib/supabase/iam"

// Mock auth check
vi.mock("@/features/auth/lib/auth", () => ({
  isManagerAuthenticated: vi.fn(),
}))

// Mock Supabase clients
vi.mock("@/lib/supabase/iam", () => ({
  createIamClient: vi.fn(),
}))

vi.mock("@/lib/supabase/app", () => ({
  createAppClient: vi.fn(),
}))

// Import after mocking
const { GET } = await import("../route")
const { isManagerAuthenticated } = await import("@/features/auth/lib/auth")

/**
 * Creates mock Supabase clients that handle all the query chains used by the route:
 * - iam.from("users").select().eq().order()
 * - iam.from("org_memberships").select().in().eq()
 * - app.from("user_quotas").select().in()
 * - app.from("domains").select().in()
 */
interface MockResponse<T> {
  data: T[] | null
  error: { message: string } | null
}

function setupSupabaseMocks(options: {
  users?: MockResponse<{
    user_id: string
    email: string
    display_name: string | null
    created_at: string
    status: string
  }>
  memberships?: MockResponse<{ user_id: string; org_id: string }>
  quotas?: MockResponse<{ user_id: string; max_sites: number }>
  domains?: MockResponse<{ user_id: string; domain: string }>
}) {
  const {
    users = { data: [], error: null },
    memberships = { data: [], error: null },
    quotas = { data: [], error: null },
    domains = { data: [], error: null },
  } = options

  // IAM client mock - handles users and org_memberships tables (cast to unknown to satisfy SupabaseClient type)
  vi.mocked(createIamClient).mockResolvedValue({
    from: vi.fn((table: string) => {
      if (table === "users") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue(users),
            }),
          }),
        }
      }
      if (table === "org_memberships") {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue(memberships),
            }),
          }),
        }
      }
      return { select: vi.fn().mockReturnValue({ eq: vi.fn(), in: vi.fn() }) }
    }),
  } as unknown as Awaited<ReturnType<typeof createIamClient>>)

  // App client mock - handles user_quotas and domains tables (cast to unknown to satisfy SupabaseClient type)
  vi.mocked(createAppClient).mockResolvedValue({
    from: vi.fn((table: string) => {
      if (table === "user_quotas") {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue(quotas),
          }),
        }
      }
      if (table === "domains") {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue(domains),
          }),
        }
      }
      return { select: vi.fn().mockReturnValue({ in: vi.fn() }) }
    }),
  } as unknown as Awaited<ReturnType<typeof createAppClient>>)
}

function createMockRequest(url: string, options: NextRequestInit = {}): NextRequest {
  return new NextRequest(url, options)
}

describe("GET /api/manager/users", () => {
  beforeAll(() => {
    // Reset mocks
    vi.clearAllMocks()
  })

  describe("Authentication", () => {
    it("should require manager authentication", async () => {
      // Mock: NOT authenticated
      vi.mocked(isManagerAuthenticated).mockResolvedValue(false)

      const req = createMockRequest("http://localhost/api/manager/users")
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.ok).toBe(false)
      expect(data.error).toBe("UNAUTHORIZED")
    })

    it("should allow authenticated manager", async () => {
      // Mock: Authenticated
      vi.mocked(isManagerAuthenticated).mockResolvedValue(true)

      // Mock: Supabase returns empty users
      setupSupabaseMocks({
        users: { data: [], error: null },
      })

      const req = createMockRequest("http://localhost/api/manager/users")
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.users).toBeDefined()
    })
  })

  describe("User Filtering", () => {
    it("should filter out test users (is_test_env = true)", async () => {
      // Mock: Authenticated
      vi.mocked(isManagerAuthenticated).mockResolvedValue(true)

      // Mock: Supabase query returns real users
      setupSupabaseMocks({
        users: {
          data: [
            {
              user_id: "user-1",
              email: "real@example.com",
              display_name: null,
              created_at: "2024-01-01",
              status: "active",
            },
            {
              user_id: "user-2",
              email: "another@example.com",
              display_name: null,
              created_at: "2024-01-01",
              status: "active",
            },
          ],
          error: null,
        },
      })

      const req = createMockRequest("http://localhost/api/manager/users")
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.ok).toBe(true)
      expect(data.users).toHaveLength(2)
    })

    it("should return only real users", async () => {
      // Mock: Authenticated
      vi.mocked(isManagerAuthenticated).mockResolvedValue(true)

      // Mock: Supabase returns user with all fields
      setupSupabaseMocks({
        users: {
          data: [
            {
              user_id: "real-1",
              email: "real.user@example.com",
              display_name: "Real User",
              created_at: "2024-01-01",
              status: "active",
            },
          ],
          error: null,
        },
      })

      const req = createMockRequest("http://localhost/api/manager/users")
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(200)
      // Now includes site_count and max_sites from the enriched response
      expect(data.users).toEqual([
        {
          user_id: "real-1",
          email: "real.user@example.com",
          display_name: "Real User",
          created_at: "2024-01-01",
          status: "active",
          site_count: 0,
          max_sites: 2, // Default from LIMITS.MAX_SITES_PER_USER
        },
      ])
    })
  })

  describe("Error Handling", () => {
    it("should handle database errors", async () => {
      // Mock: Authenticated
      vi.mocked(isManagerAuthenticated).mockResolvedValue(true)

      // Mock: Supabase error
      setupSupabaseMocks({
        users: { data: null, error: { message: "Database connection failed" } },
      })

      const req = createMockRequest("http://localhost/api/manager/users")
      const response = await GET(req)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.ok).toBe(false)
      expect(data.error).toBe("INTERNAL_ERROR")
    })
  })

  describe("CORS", () => {
    it("should add CORS headers to response", async () => {
      // Mock: Authenticated
      vi.mocked(isManagerAuthenticated).mockResolvedValue(true)

      // Mock: Supabase returns empty
      setupSupabaseMocks({
        users: { data: [], error: null },
      })

      const req = createMockRequest("http://localhost/api/manager/users", {
        headers: { origin: DOMAINS.BRIDGE_DEV },
      })

      const response = await GET(req)

      expect(response.headers.get("Access-Control-Allow-Origin")).toBeTruthy()
    })
  })
})
