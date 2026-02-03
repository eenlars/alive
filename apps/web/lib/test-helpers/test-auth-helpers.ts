/**
 * Test Authentication Helpers
 *
 * Reusable helpers for authentication in tests
 * DRY: All auth logic lives here, not in individual test files
 */

import { POST as deployPOST } from "@/app/api/deploy-subdomain/route"
import { POST as loginPOST } from "@/app/api/login/route"
import { GET as tokensGET } from "@/app/api/tokens/route"
import { POST as verifyPOST } from "@/app/api/verify/route"
import { runWithRequestContext } from "../../tests/setup"
import type { TestUser } from "./auth-test-helper"
import { API_ENDPOINTS, SESSION_COOKIE, TEST_CREDENTIALS } from "./test-constants"

type RouteHandler = (req: any) => Promise<Response>

const ROUTE_HANDLERS: Record<string, Partial<Record<string, RouteHandler>>> = {
  "/api/deploy-subdomain": { POST: deployPOST as RouteHandler },
  "/api/login": { POST: loginPOST as RouteHandler },
  "/api/verify": { POST: verifyPOST as RouteHandler },
  "/api/tokens": { GET: tokensGET as RouteHandler },
}

/**
 * Call route handler directly (for testing without HTTP server)
 * Uses AsyncLocalStorage to provide request context to Next.js mocks
 *
 * Use this directly for unauthenticated requests.
 * For authenticated requests, use authenticatedFetch() instead.
 */
export async function callRouteHandler(url: string, options: RequestInit = {}): Promise<Response> {
  const urlObj = new URL(url, "http://localhost")
  const method = options.method || "GET"
  const handler = ROUTE_HANDLERS[urlObj.pathname]?.[method]

  if (!handler) {
    throw new Error(`No route handler found for ${method} ${urlObj.pathname}`)
  }

  const request = new Request(url, options)

  // Run handler within AsyncLocalStorage context
  return runWithRequestContext(request, () => handler(request))
}

/**
 * Login and get session cookie
 *
 * @param email - User email
 * @param password - User password (defaults to TEST_CREDENTIALS.PASSWORD)
 * @returns Session cookie string (e.g., "auth_session=xyz123")
 */
export async function loginAndGetSession(email: string, password: string = TEST_CREDENTIALS.PASSWORD): Promise<string> {
  const response = await callRouteHandler(API_ENDPOINTS.LOGIN, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Login failed: ${response.status} ${response.statusText} - ${errorText}`)
  }

  const setCookie = response.headers.get("set-cookie")
  if (!setCookie) {
    throw new Error("No Set-Cookie header in login response")
  }

  const match = setCookie.match(SESSION_COOKIE.PATTERN)
  if (!match) {
    throw new Error(`Invalid session cookie format: ${setCookie}`)
  }

  return `${SESSION_COOKIE.NAME}=${match[1]}`
}

/**
 * Create test user and get session in one step
 *
 * Common pattern: Create user → Login → Get session
 * This function does all three
 *
 * @param createTestUser - The createTestUser function from auth-test-helper
 * @param emailPrefix - Prefix for generated email (default: "test")
 * @returns Object with user info and session cookie
 */
export async function createAuthenticatedTestUser(
  createTestUser: (email?: string, credits?: number, password?: string) => Promise<TestUser>,
  emailPrefix: string = "test",
): Promise<TestUser & { sessionCookie: string }> {
  const email = `${emailPrefix}-${Date.now()}@test.com`
  const user = await createTestUser(email, TEST_CREDENTIALS.CREDITS, TEST_CREDENTIALS.PASSWORD)
  const sessionCookie = await loginAndGetSession(user.email, TEST_CREDENTIALS.PASSWORD)

  return {
    ...user,
    sessionCookie,
  }
}

/**
 * Make authenticated API request
 *
 * @param url - API endpoint URL
 * @param sessionCookie - Session cookie string
 * @param options - Additional fetch options
 * @returns Fetch response
 */
export async function authenticatedFetch(
  url: string,
  sessionCookie: string,
  options: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(options.headers)
  headers.set("Cookie", sessionCookie)

  if (options.method === "POST" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  return callRouteHandler(url, { ...options, headers })
}
