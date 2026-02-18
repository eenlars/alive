import { ZodError } from "zod"
import { ApiError } from "./error"
import type { ClientOptions, Endpoint, Req, Res, SchemaRegistry } from "./types"

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
    pathOverride?: string,
  ): Promise<Res<T, E>> {
    const path = pathOverride ?? `${basePath.replace(/\/$/, "")}/${String(endpoint).replace(/^\//, "")}`
    const hasBody = method !== "GET"

    // Validate request body against schema (runs even for undefined to catch missing required fields)
    if (hasBody && schemas[endpoint].req) {
      try {
        schemas[endpoint].req.parse(body)
      } catch (e) {
        throw new ApiError(
          "Request validation failed",
          undefined,
          "REQUEST_VALIDATION_ERROR",
          e instanceof ZodError ? e.issues : e,
        )
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
    // Supports: { error: { message, code } }, { error: "CODE", message: "..." }, { message: "..." }
    if (!res.ok) {
      const err = json as Record<string, unknown>
      const nested = err?.error as Record<string, unknown> | string | undefined
      // Prefer top-level message (user-friendly from server) over raw error code string
      const message =
        (typeof err?.message === "string" && err.message ? err.message : undefined) ??
        (typeof nested === "object" && typeof nested?.message === "string" ? nested.message : undefined) ??
        (typeof nested === "string" ? nested : undefined) ??
        `HTTP ${res.status}`
      const code =
        (typeof nested === "object" && typeof nested?.code === "string" ? nested.code : undefined) ??
        (typeof nested === "string" ? nested : undefined) ??
        (typeof err?.code === "string" ? err.code : undefined) ??
        "HTTP_ERROR"
      throw new ApiError(message, res.status, code, json)
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

  function deletty<E extends Endpoint<T>>(
    endpoint: E,
    init?: Omit<RequestInit, "body" | "method">,
    pathOverride?: string,
  ): Promise<Res<T, E>>
  function deletty<E extends Endpoint<T>>(
    endpoint: E,
    body: Req<T, E>,
    init?: Omit<RequestInit, "body" | "method">,
    pathOverride?: string,
  ): Promise<Res<T, E>>
  function deletty<E extends Endpoint<T>>(
    endpoint: E,
    bodyOrInit?: Req<T, E> | Omit<RequestInit, "body" | "method">,
    initOrPath?: Omit<RequestInit, "body" | "method"> | string,
    pathOverrideMaybe?: string,
  ): Promise<Res<T, E>> {
    let body: unknown
    let init: Omit<RequestInit, "body" | "method"> | undefined
    let pathOverrideResolved: string | undefined

    if (typeof pathOverrideMaybe === "string") {
      // New form: deletty(endpoint, body, init?, pathOverride)
      body = bodyOrInit
      init = initOrPath as Omit<RequestInit, "body" | "method"> | undefined
      pathOverrideResolved = pathOverrideMaybe
    } else if (typeof initOrPath === "string") {
      // Backward compatible form: deletty(endpoint, init?, pathOverride)
      init = bodyOrInit as Omit<RequestInit, "body" | "method"> | undefined
      pathOverrideResolved = initOrPath
    } else if (initOrPath !== undefined) {
      // New form: deletty(endpoint, body, init)
      body = bodyOrInit
      init = initOrPath as Omit<RequestInit, "body" | "method"> | undefined
    } else if (bodyOrInit === undefined) {
      init = undefined
    } else if (schemas[endpoint].req) {
      // New form: deletty(endpoint, body)
      body = bodyOrInit
    } else {
      // Endpoint has no request schema; treat second arg as RequestInit for compatibility.
      init = bodyOrInit as Omit<RequestInit, "body" | "method">
    }

    return api(endpoint, "DELETE", body, init, pathOverrideResolved)
  }

  function delly<E extends Endpoint<T>>(
    endpoint: E,
    init?: Omit<RequestInit, "body" | "method">,
    pathOverride?: string,
  ): Promise<Res<T, E>>
  function delly<E extends Endpoint<T>>(
    endpoint: E,
    body: Req<T, E>,
    init?: Omit<RequestInit, "body" | "method">,
    pathOverride?: string,
  ): Promise<Res<T, E>>
  function delly<E extends Endpoint<T>>(
    endpoint: E,
    bodyOrInit?: Req<T, E> | Omit<RequestInit, "body" | "method">,
    initOrPath?: Omit<RequestInit, "body" | "method"> | string,
    pathOverrideMaybe?: string,
  ): Promise<Res<T, E>> {
    return deletty(
      endpoint,
      bodyOrInit as Req<T, E>,
      initOrPath as Omit<RequestInit, "body" | "method">,
      pathOverrideMaybe,
    )
  }

  return {
    getty: <E extends Endpoint<T>>(endpoint: E, init?: Omit<RequestInit, "body" | "method">, pathOverride?: string) =>
      api(endpoint, "GET", undefined, init, pathOverride),
    postty: <E extends Endpoint<T>>(
      endpoint: E,
      body: Req<T, E>,
      init?: Omit<RequestInit, "body" | "method">,
      pathOverride?: string,
    ) => api(endpoint, "POST", body, init, pathOverride),
    putty: <E extends Endpoint<T>>(
      endpoint: E,
      body: Req<T, E>,
      init?: Omit<RequestInit, "body" | "method">,
      pathOverride?: string,
    ) => api(endpoint, "PUT", body, init, pathOverride),
    patchy: <E extends Endpoint<T>>(
      endpoint: E,
      body: Req<T, E>,
      init?: Omit<RequestInit, "body" | "method">,
      pathOverride?: string,
    ) => api(endpoint, "PATCH", body, init, pathOverride),
    deletty,
    /** Alias for deletty */
    delly,
  }
}
