/**
 * Type-safe API fetcher for TanStack Query
 *
 * Benefits:
 * - Consistent error handling across all queries
 * - Typed responses with generics
 * - Automatic credentials handling
 * - Clean error messages
 */

// ============================================
// API Error Class
// ============================================

/**
 * Custom error class for API errors
 * Provides typed error information for handling in components
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message)
    this.name = "ApiError"
  }

  get isUnauthorized(): boolean {
    return this.status === 401
  }

  get isForbidden(): boolean {
    return this.status === 403
  }

  get isNotFound(): boolean {
    return this.status === 404
  }

  get isServerError(): boolean {
    return this.status >= 500
  }

  get isRateLimited(): boolean {
    return this.status === 429
  }

  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500
  }
}

// ============================================
// API Response Types
// ============================================

/**
 * Standard API response structure
 * All endpoints should return { ok: boolean, data?, error? }
 */
export interface ApiResponse<T> {
  ok: boolean
  data?: T
  error?: string
  // Legacy format support
  [key: string]: unknown
}

// ============================================
// Fetcher Options
// ============================================

interface FetcherOptions extends Omit<RequestInit, "body"> {
  /** Request body (will be JSON stringified) */
  body?: unknown
}

// ============================================
// Main Fetcher
// ============================================

/**
 * Type-safe API fetcher
 *
 * @example
 * // GET request
 * const user = await fetcher<User>('/api/user')
 *
 * // POST request
 * const result = await fetcher<Result>('/api/create', {
 *   method: 'POST',
 *   body: { name: 'test' }
 * })
 */
export async function fetcher<T>(url: string, options: FetcherOptions = {}): Promise<T> {
  const { body, ...fetchOptions } = options

  const config: RequestInit = {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...fetchOptions,
  }

  if (body !== undefined) {
    config.body = JSON.stringify(body)
  }

  const response = await fetch(url, config)

  // Handle non-OK responses
  if (!response.ok) {
    let errorMessage = `Request failed: ${response.status}`

    try {
      const errorData = await response.json()
      errorMessage = errorData.error || errorData.message || errorMessage
    } catch {
      // Response isn't JSON, use default message
    }

    throw new ApiError(errorMessage, response.status)
  }

  // Parse JSON response
  const data = await response.json()

  // Handle our standard API response format
  if (typeof data === "object" && data !== null && "ok" in data) {
    const apiResponse = data as ApiResponse<T>
    if (!apiResponse.ok) {
      throw new ApiError(apiResponse.error || "Request failed", response.status)
    }
    // Return data field if it exists, otherwise the whole response
    return (apiResponse.data ?? data) as T
  }

  return data as T
}

// ============================================
// Convenience Methods
// ============================================

/**
 * GET request helper
 */
fetcher.get = <T>(url: string, options?: Omit<FetcherOptions, "method">) =>
  fetcher<T>(url, { ...options, method: "GET" })

/**
 * POST request helper
 */
fetcher.post = <T>(url: string, body?: unknown, options?: Omit<FetcherOptions, "method" | "body">) =>
  fetcher<T>(url, { ...options, method: "POST", body })

/**
 * PUT request helper
 */
fetcher.put = <T>(url: string, body?: unknown, options?: Omit<FetcherOptions, "method" | "body">) =>
  fetcher<T>(url, { ...options, method: "PUT", body })

/**
 * PATCH request helper
 */
fetcher.patch = <T>(url: string, body?: unknown, options?: Omit<FetcherOptions, "method" | "body">) =>
  fetcher<T>(url, { ...options, method: "PATCH", body })

/**
 * DELETE request helper
 */
fetcher.delete = <T>(url: string, options?: Omit<FetcherOptions, "method">) =>
  fetcher<T>(url, { ...options, method: "DELETE" })
