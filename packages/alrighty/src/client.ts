import { ZodError } from "zod"
import { ApiError } from "./error"
import type { ClientOptions, Endpoint, MutationEndpoint, Req, Res, SchemaRegistry } from "./types"

/**
 * Creates a typed API client from a schema registry
 */
export function createClient<T extends SchemaRegistry>(schemas: T, options: ClientOptions = {}) {
  const { basePath = "/api", credentials = "include", headers: defaultHeaders } = options

  async function api<E extends Endpoint<T>>(
    endpoint: E,
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    body?: unknown,
    init?: Omit<RequestInit, "body" | "method">,
  ): Promise<Res<T, E>> {
    const path = `${basePath.replace(/\/$/, "")}/${String(endpoint).replace(/^\//, "")}`
    const hasBody = method !== "GET" && method !== "DELETE"

    // Validate request
    if (hasBody && body !== undefined && schemas[endpoint].req) {
      try {
        schemas[endpoint].req.parse(body)
      } catch (e) {
        throw new ApiError("Request validation failed", undefined, "REQUEST_VALIDATION_ERROR", e instanceof ZodError ? e.issues : e)
      }
    }

    // Fetch
    let res: Response
    try {
      res = await fetch(path, {
        ...init,
        method,
        credentials,
        headers: { "Content-Type": "application/json", ...defaultHeaders, ...init?.headers },
        body: hasBody && body !== undefined ? JSON.stringify(body) : undefined,
      })
    } catch (e) {
      throw new ApiError("Network error", undefined, "NETWORK_ERROR", e)
    }

    // Parse response
    let json: unknown
    try {
      json = await res.json()
    } catch {
      throw new ApiError("Non-JSON response", res.status, "NON_JSON_RESPONSE")
    }

    // Handle HTTP errors
    if (!res.ok) {
      const err = json as Record<string, unknown>
      const nested = err?.error as Record<string, unknown> | string | undefined
      throw new ApiError(
        String((typeof nested === "object" ? nested?.message : nested) ?? err?.message ?? `HTTP ${res.status}`),
        res.status,
        String((typeof nested === "object" ? nested?.code : undefined) ?? err?.code ?? "HTTP_ERROR"),
        json,
      )
    }

    // Validate response
    try {
      return schemas[endpoint].res.parse(json) as Res<T, E>
    } catch (e) {
      if (e instanceof ZodError) {
        throw new ApiError("Response validation failed", res.status, "VALIDATION_ERROR", e.issues)
      }
      throw new ApiError("Response parsing failed", res.status, "PARSE_ERROR", e)
    }
  }

  return {
    getty: <E extends Endpoint<T>>(endpoint: E, init?: Omit<RequestInit, "body" | "method">) =>
      api(endpoint, "GET", undefined, init),
    postty: <E extends MutationEndpoint<T>>(endpoint: E, body: Req<T, E>, init?: Omit<RequestInit, "body" | "method">) =>
      api(endpoint, "POST", body, init),
    putty: <E extends MutationEndpoint<T>>(endpoint: E, body: Req<T, E>, init?: Omit<RequestInit, "body" | "method">) =>
      api(endpoint, "PUT", body, init),
    patchy: <E extends MutationEndpoint<T>>(endpoint: E, body: Req<T, E>, init?: Omit<RequestInit, "body" | "method">) =>
      api(endpoint, "PATCH", body, init),
    deletty: <E extends Endpoint<T>>(endpoint: E, init?: Omit<RequestInit, "body" | "method">) =>
      api(endpoint, "DELETE", undefined, init),
  }
}
