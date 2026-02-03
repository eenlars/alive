/**
 * Authenticated Fetch Helper
 *
 * ALWAYS use this for API calls that require authentication.
 * Mobile browsers (especially Safari) require explicit `credentials: "include"`
 * to send cookies with fetch requests.
 *
 * @example
 * // Simple GET
 * const response = await authFetch("/api/auth/organizations")
 *
 * // POST with body
 * const response = await authFetch("/api/claude/stream", {
 *   method: "POST",
 *   body: JSON.stringify(data),
 * })
 */
export async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  })
}

/**
 * Authenticated JSON fetch - fetches and parses JSON response
 *
 * @example
 * const data = await authFetchJson<{ ok: boolean }>("/api/auth/organizations")
 */
export async function authFetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await authFetch(url, init)
  return response.json()
}
