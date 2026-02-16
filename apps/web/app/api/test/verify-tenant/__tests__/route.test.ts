import * as Sentry from "@sentry/nextjs"
import { TEST_CONFIG } from "@webalive/shared"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ErrorCodes } from "@/lib/error-codes"

vi.mock("@/lib/supabase/iam", () => ({
  createIamClient: vi.fn(),
}))

vi.mock("@/lib/supabase/app", () => ({
  createAppClient: vi.fn(),
}))

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}))

const { GET } = await import("../route")
const { createIamClient } = await import("@/lib/supabase/iam")
const { createAppClient } = await import("@/lib/supabase/app")

interface DbErrorLike {
  code?: string
  message?: string
}

interface QueryResult<T> {
  data: T
  error: DbErrorLike | null
}

interface IamMockOptions {
  user?: QueryResult<{ user_id: string } | null>
  memberships?: QueryResult<Array<{ org_id: string }> | null>
  org?: QueryResult<{ credits: number } | null>
}

interface AppMockOptions {
  domains?: QueryResult<Array<{ hostname: string }> | null>
}

function createMockIamClient(options: IamMockOptions = {}) {
  const user = options.user ?? { data: { user_id: "user-1" }, error: null }
  const memberships = options.memberships ?? { data: [{ org_id: "org-1" }], error: null }
  const org = options.org ?? { data: { credits: 100 }, error: null }

  return {
    from: vi.fn((table: string) => {
      if (table === "users") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(user),
            }),
          }),
        }
      }

      if (table === "org_memberships") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(memberships),
            }),
          }),
        }
      }

      if (table === "orgs") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(org),
            }),
          }),
        }
      }

      throw new Error(`Unexpected IAM table: ${table}`)
    }),
  } as unknown
}

function createMockAppClient(options: AppMockOptions = {}) {
  const domains = options.domains ?? { data: [{ hostname: "e2e-w0.alive.local" }], error: null }

  return {
    from: vi.fn((table: string) => {
      if (table === "domains") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(domains),
            }),
          }),
        }
      }

      throw new Error(`Unexpected app table: ${table}`)
    }),
  } as unknown
}

function createRequest(email?: string): Request {
  const url = new URL("http://localhost/api/test/verify-tenant")
  if (email) {
    url.searchParams.set("email", email)
  }
  return new Request(url.toString(), { method: "GET" })
}

describe("GET /api/test/verify-tenant", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createIamClient).mockResolvedValue(createMockIamClient() as never)
    vi.mocked(createAppClient).mockResolvedValue(createMockAppClient() as never)
  })

  it("returns 400 when email is missing", async () => {
    const res = await GET(createRequest())
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.ok).toBe(false)
    expect(json.error).toBe(ErrorCodes.VALIDATION_ERROR)
  })

  it("returns ready=true when tenant data exists", async () => {
    const email = `${TEST_CONFIG.WORKER_EMAIL_PREFIX}0@${TEST_CONFIG.EMAIL_DOMAIN}`
    const res = await GET(createRequest(email))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.ready).toBe(true)
  })

  it("returns missing:user when user does not exist", async () => {
    vi.mocked(createIamClient).mockResolvedValue(
      createMockIamClient({
        user: { data: null, error: { code: "PGRST116", message: "No rows found" } },
      }) as never,
    )

    const email = `${TEST_CONFIG.WORKER_EMAIL_PREFIX}0@${TEST_CONFIG.EMAIL_DOMAIN}`
    const res = await GET(createRequest(email))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ ready: false, missing: "user" })
  })

  it("returns query_error for membership query failures", async () => {
    vi.mocked(createIamClient).mockResolvedValue(
      createMockIamClient({
        memberships: { data: null, error: { code: "XX001", message: "membership query failed" } },
      }) as never,
    )

    const email = `${TEST_CONFIG.WORKER_EMAIL_PREFIX}0@${TEST_CONFIG.EMAIL_DOMAIN}`
    const res = await GET(createRequest(email))
    const json = await res.json()

    expect(res.status).toBe(503)
    expect(json.ready).toBe(false)
    expect(json.reason).toBe("query_error")
    expect(json.check).toBe("membership")
    expect(json.code).toBe("XX001")
  })

  it("returns missing:domain when workspace domain does not exist", async () => {
    vi.mocked(createAppClient).mockResolvedValue(
      createMockAppClient({
        domains: { data: [], error: null },
      }) as never,
    )

    const email = `${TEST_CONFIG.WORKER_EMAIL_PREFIX}0@${TEST_CONFIG.EMAIL_DOMAIN}`
    const res = await GET(createRequest(email))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ ready: false, missing: "domain" })
  })

  it("returns 500 and reports to sentry on unexpected errors", async () => {
    const error = new Error("database unavailable")
    vi.mocked(createIamClient).mockRejectedValue(error)

    const email = `${TEST_CONFIG.WORKER_EMAIL_PREFIX}0@${TEST_CONFIG.EMAIL_DOMAIN}`
    const res = await GET(createRequest(email))
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.ok).toBe(false)
    expect(json.error).toBe(ErrorCodes.INTERNAL_ERROR)
    expect(Sentry.captureException).toHaveBeenCalledWith(error)
  })
})
