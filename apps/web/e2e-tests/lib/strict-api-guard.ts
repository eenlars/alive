/**
 * Strict API Guard utilities for E2E fixtures.
 *
 * Guarded endpoints MUST be fulfilled by Playwright route mocks.
 * Responses without the E2E mock marker header are treated as violations.
 */

export const E2E_MOCK_HEADER = "x-e2e-mock"

const GUARDED_API_PATHS = new Set([
  "/api/user",
  "/api/auth/organizations",
  "/api/auth/workspaces",
  "/api/auth/all-workspaces",
])

export function isGuardedApiPath(pathname: string): boolean {
  return GUARDED_API_PATHS.has(pathname)
}

export function buildMockHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    [E2E_MOCK_HEADER]: "1",
    ...(extra ?? {}),
  }
}

export function buildJsonMockResponse(
  body: unknown,
  status = 200,
): {
  status: number
  contentType: string
  headers: Record<string, string>
  body: string
} {
  return {
    status,
    contentType: "application/json",
    headers: buildMockHeaders(),
    body: JSON.stringify(body),
  }
}

export function getStrictApiGuardEnabled(): boolean {
  if (process.env.E2E_STRICT_API_GUARD === "0") {
    if (process.env.CI) {
      throw new Error("[E2E Strict API Guard] E2E_STRICT_API_GUARD=0 is not allowed in CI.")
    }
    return false
  }

  return true
}
