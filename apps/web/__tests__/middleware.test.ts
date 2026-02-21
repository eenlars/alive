import { type NextRequest, NextResponse } from "next/server"
import { describe, expect, it, vi } from "vitest"
import { REQUEST_ID_HEADER } from "@/lib/request-id"
import { middleware } from "../middleware"

/**
 * Build a minimal NextRequest-like object for testing middleware.
 */
function buildRequest(url: string, headers?: Record<string, string>): NextRequest {
  return new Request(url, { headers }) as unknown as NextRequest
}

// Capture what NextResponse.next() receives so we can inspect request header injection.
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server")

  return {
    ...actual,
    NextResponse: {
      ...actual.NextResponse,
      next(init?: { request?: { headers?: Headers } }) {
        // Build a real Response so .headers works naturally.
        const res = new Response(null, { status: 200 })

        // Stash the injected request headers so tests can assert on them.
        ;(res as unknown as Record<string, unknown>).__injectedRequestHeaders = init?.request?.headers

        return res as unknown as ReturnType<typeof actual.NextResponse.next>
      },
    },
  }
})

describe("request-id middleware", () => {
  it("generates a UUID when no X-Request-Id is provided", () => {
    const req = buildRequest("http://localhost/api/test")
    const res = middleware(req)

    const id = res.headers.get(REQUEST_ID_HEADER)
    expect(id).toBeTruthy()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it("preserves an incoming X-Request-Id", () => {
    const req = buildRequest("http://localhost/api/test", {
      "x-request-id": "caller-supplied-id",
    })
    const res = middleware(req)

    expect(res.headers.get(REQUEST_ID_HEADER)).toBe("caller-supplied-id")
  })

  it("sets X-Request-Id on the response", () => {
    const req = buildRequest("http://localhost/api/test")
    const res = middleware(req)

    expect(res.headers.has(REQUEST_ID_HEADER)).toBe(true)
  })

  it("exposes X-Request-Id via Access-Control-Expose-Headers", () => {
    const req = buildRequest("http://localhost/api/test")
    const res = middleware(req)

    const expose = res.headers.get("access-control-expose-headers")
    expect(expose).toContain("X-Request-Id")
  })

  it("forwards the request ID to route handlers via request headers", () => {
    const req = buildRequest("http://localhost/api/test", {
      "x-request-id": "forward-me",
    })
    const res = middleware(req)

    // The mock stashes injected request headers on __injectedRequestHeaders
    const injected = (res as unknown as Record<string, unknown>).__injectedRequestHeaders as Headers | undefined
    expect(injected).toBeDefined()
    expect(injected!.get(REQUEST_ID_HEADER)).toBe("forward-me")
  })

  it("response and injected request IDs match", () => {
    const req = buildRequest("http://localhost/api/test")
    const res = middleware(req)

    const responseId = res.headers.get(REQUEST_ID_HEADER)
    const injected = (res as unknown as Record<string, unknown>).__injectedRequestHeaders as Headers | undefined
    expect(injected!.get(REQUEST_ID_HEADER)).toBe(responseId)
  })
})
