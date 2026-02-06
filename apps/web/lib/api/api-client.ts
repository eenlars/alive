"use client"

import { ApiError, createClient } from "@alive-brug/alrighty"
import { ZodError } from "zod"
import { apiSchemas, type Endpoint, type Req, type Res } from "./schemas"

// Re-export ApiError for backwards compatibility
export { ApiError }

// Create the typed client
const client = createClient(apiSchemas)

// Type for path override (for dynamic routes like /api/manager/templates)
type PathOverride = string | undefined

/**
 * Internal fetch with path override support.
 * Used when the actual API path differs from the endpoint name.
 */
async function fetchWithOverride<E extends Endpoint>(
  endpoint: E,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  body: unknown,
  init: Omit<RequestInit, "body" | "method"> | undefined,
  pathOverride: PathOverride,
): Promise<Res<E>> {
  // If no path override, use the standard client
  if (!pathOverride) {
    switch (method) {
      case "GET":
        return client.getty(endpoint as Parameters<typeof client.getty>[0], init) as Promise<Res<E>>
      case "POST":
        return client.postty(
          endpoint as Parameters<typeof client.postty>[0],
          body as Parameters<typeof client.postty>[1],
          init,
        ) as Promise<Res<E>>
      case "PUT":
        return client.putty(
          endpoint as Parameters<typeof client.putty>[0],
          body as Parameters<typeof client.putty>[1],
          init,
        ) as Promise<Res<E>>
      case "PATCH":
        return client.patchy(
          endpoint as Parameters<typeof client.patchy>[0],
          body as Parameters<typeof client.patchy>[1],
          init,
        ) as Promise<Res<E>>
      case "DELETE":
        return client.deletty(endpoint as Parameters<typeof client.deletty>[0], init) as Promise<Res<E>>
    }
  }

  // Path override: manual fetch with validation
  const hasBody = method !== "GET" && method !== "DELETE"

  // Validate request body if schema exists
  if (hasBody && body !== undefined) {
    const schema = apiSchemas[endpoint]
    if ("req" in schema && schema.req) {
      try {
        schema.req.parse(body)
      } catch (e) {
        if (e instanceof ZodError) {
          throw new ApiError("Request validation failed", undefined, "REQUEST_VALIDATION_ERROR", e.issues)
        }
        throw new ApiError("Request validation failed", undefined, "REQUEST_VALIDATION_ERROR", e)
      }
    }
  }

  let res: Response
  try {
    res = await fetch(pathOverride, {
      ...init,
      method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
      body: hasBody && body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (e) {
    throw new ApiError("Network error", undefined, "NETWORK_ERROR", e)
  }

  let json: unknown
  try {
    json = await res.json()
  } catch {
    throw new ApiError("Non-JSON response", res.status, "NON_JSON_RESPONSE")
  }

  if (!res.ok) {
    const err = json as Record<string, unknown>
    const nested = err?.error as Record<string, unknown> | string | undefined

    // Extract human-readable message:
    // - { error: { message: "..." } }  → nested object message
    // - { error: "CODE", message: "..." } → top-level message (our standard format)
    // - { error: "raw message" }        → error string as fallback
    const message =
      (typeof nested === "object" ? nested?.message : undefined) ??
      (err?.message as string | undefined) ??
      (typeof nested === "string" ? nested : undefined) ??
      `HTTP ${res.status}`

    const code = (typeof nested === "object" ? nested?.code : undefined) ?? err?.code ?? "HTTP_ERROR"
    throw new ApiError(String(message), res.status, String(code), json)
  }

  try {
    return apiSchemas[endpoint].res.parse(json) as Res<E>
  } catch (e) {
    if (e instanceof ZodError) {
      throw new ApiError("Response validation failed", res.status, "VALIDATION_ERROR", e.issues)
    }
    throw new ApiError("Response parsing failed", res.status, "PARSE_ERROR", e)
  }
}

// ----- typed wrappers with pathOverride for backwards compatibility -----

export const getty = <E extends Endpoint>(
  endpoint: E,
  init?: Omit<RequestInit, "body" | "method">,
  pathOverride?: PathOverride,
) => fetchWithOverride<E>(endpoint, "GET", undefined, init, pathOverride)

export const postty = <E extends Endpoint>(
  endpoint: E,
  body: Req<E>,
  init?: Omit<RequestInit, "body" | "method">,
  pathOverride?: PathOverride,
) => fetchWithOverride<E>(endpoint, "POST", body, init, pathOverride)

export const putty = <E extends Endpoint>(
  endpoint: E,
  body: Req<E>,
  init?: Omit<RequestInit, "body" | "method">,
  pathOverride?: PathOverride,
) => fetchWithOverride<E>(endpoint, "PUT", body, init, pathOverride)

export const patchy = <E extends Endpoint>(
  endpoint: E,
  body: Req<E>,
  init?: Omit<RequestInit, "body" | "method">,
  pathOverride?: PathOverride,
) => fetchWithOverride<E>(endpoint, "PATCH", body, init, pathOverride)

export const delly = <E extends Endpoint>(
  endpoint: E,
  init?: Omit<RequestInit, "body" | "method">,
  pathOverride?: PathOverride,
) => fetchWithOverride<E>(endpoint, "DELETE", undefined, init, pathOverride)

// Alias for consistency with new package naming
export const deletty = delly
