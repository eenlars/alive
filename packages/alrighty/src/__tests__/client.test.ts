import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { ApiError, createClient, type SchemaRegistry } from "../index"

// Test schemas
const schemas = {
  // GET endpoint - no req
  user: {
    res: z.object({ id: z.string(), email: z.string() }),
  },
  // GET with query params conceptually (still no body)
  "users/search": {
    res: z.object({ users: z.array(z.object({ id: z.string() })) }),
  },
  // POST endpoint - has req with validation
  login: {
    req: z.object({ email: z.string().email(), password: z.string().min(1) }),
    res: z.object({ ok: z.boolean(), token: z.string().optional() }),
  },
  // PUT endpoint
  "user/update": {
    req: z.object({ name: z.string() }),
    res: z.object({ ok: z.boolean() }),
  },
  // PATCH endpoint
  "user/patch": {
    req: z.object({ name: z.string().optional() }),
    res: z.object({ ok: z.boolean() }),
  },
  // DELETE endpoint (no req, can use deletty)
  "user/delete": {
    res: z.object({ ok: z.boolean() }),
  },
  // DELETE endpoint with body
  "user/remove": {
    req: z.object({ userId: z.string().min(1) }),
    res: z.object({ ok: z.boolean() }),
  },
} satisfies SchemaRegistry

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
  mockFetch.mockReset()
})

function mockResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
  })
}

describe("createClient", () => {
  describe("getty (GET)", () => {
    it("makes GET request to correct path", async () => {
      mockFetch.mockReturnValue(mockResponse({ id: "1", email: "test@example.com" }))

      const { getty } = createClient(schemas)
      await getty("user")

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/user",
        expect.objectContaining({
          method: "GET",
          credentials: "include",
        }),
      )
    })

    it("returns validated response", async () => {
      mockFetch.mockReturnValue(mockResponse({ id: "1", email: "test@example.com" }))

      const { getty } = createClient(schemas)
      const result = await getty("user")

      expect(result).toEqual({ id: "1", email: "test@example.com" })
    })

    it("does not include body in request", async () => {
      mockFetch.mockReturnValue(mockResponse({ id: "1", email: "test@example.com" }))

      const { getty } = createClient(schemas)
      await getty("user")

      const call = mockFetch.mock.calls[0]
      expect(call[1].body).toBeUndefined()
    })

    it("respects custom basePath", async () => {
      mockFetch.mockReturnValue(mockResponse({ id: "1", email: "test@example.com" }))

      const { getty } = createClient(schemas, { basePath: "/v2" })
      await getty("user")

      expect(mockFetch).toHaveBeenCalledWith("/v2/user", expect.anything())
    })

    it("handles endpoint with slashes", async () => {
      mockFetch.mockReturnValue(mockResponse({ users: [{ id: "1" }] }))

      const { getty } = createClient(schemas)
      await getty("users/search")

      expect(mockFetch).toHaveBeenCalledWith("/api/users/search", expect.anything())
    })

    it("normalizes double slashes", async () => {
      mockFetch.mockReturnValue(mockResponse({ id: "1", email: "test@example.com" }))

      const { getty } = createClient(schemas, { basePath: "/api/" })
      await getty("user")

      expect(mockFetch).toHaveBeenCalledWith("/api/user", expect.anything())
    })

    it("handles leading slash in endpoint", async () => {
      // Create a schema with leading slash endpoint for this test
      const slashSchemas = {
        "/user": { res: z.object({ id: z.string() }) },
      } satisfies SchemaRegistry

      mockFetch.mockReturnValue(mockResponse({ id: "1" }))

      const { getty } = createClient(slashSchemas)
      await getty("/user")

      expect(mockFetch).toHaveBeenCalledWith("/api/user", expect.anything())
    })
  })

  describe("postty (POST)", () => {
    it("makes POST request with body", async () => {
      mockFetch.mockReturnValue(mockResponse({ ok: true, token: "abc123" }))

      const { postty } = createClient(schemas)
      await postty("login", { email: "test@example.com", password: "secret" })

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/login",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ email: "test@example.com", password: "secret" }),
        }),
      )
    })

    it("sets Content-Type header", async () => {
      mockFetch.mockReturnValue(mockResponse({ ok: true }))

      const { postty } = createClient(schemas)
      await postty("login", { email: "test@example.com", password: "secret" })

      const call = mockFetch.mock.calls[0]
      expect(call[1].headers["Content-Type"]).toBe("application/json")
    })

    it("validates request body with Zod", async () => {
      const { postty } = createClient(schemas)

      // Invalid email should fail validation
      await expect(postty("login", { email: "not-an-email", password: "secret" })).rejects.toMatchObject({
        code: "REQUEST_VALIDATION_ERROR",
        message: "Request validation failed",
      })

      // Fetch should not have been called
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it("validates required fields", async () => {
      const { postty } = createClient(schemas)

      // Empty password should fail (min 1)
      await expect(postty("login", { email: "test@example.com", password: "" })).rejects.toMatchObject({
        code: "REQUEST_VALIDATION_ERROR",
      })
    })
  })

  describe("putty (PUT)", () => {
    it("makes PUT request with body", async () => {
      mockFetch.mockReturnValue(mockResponse({ ok: true }))

      const { putty } = createClient(schemas)
      await putty("user/update", { name: "New Name" })

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/user/update",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ name: "New Name" }),
        }),
      )
    })
  })

  describe("patchy (PATCH)", () => {
    it("makes PATCH request with body", async () => {
      mockFetch.mockReturnValue(mockResponse({ ok: true }))

      const { patchy } = createClient(schemas)
      await patchy("user/patch", { name: "Partial Update" })

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/user/patch",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ name: "Partial Update" }),
        }),
      )
    })
  })

  describe("deletty (DELETE)", () => {
    it("makes DELETE request without body", async () => {
      mockFetch.mockReturnValue(mockResponse({ ok: true }))

      const { deletty } = createClient(schemas)
      await deletty("user/delete")

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/user/delete",
        expect.objectContaining({
          method: "DELETE",
        }),
      )

      const call = mockFetch.mock.calls[0]
      expect(call[1].body).toBeUndefined()
    })

    it("supports validated DELETE body for endpoints with req schema", async () => {
      mockFetch.mockReturnValue(mockResponse({ ok: true }))

      const { deletty } = createClient(schemas)
      await deletty("user/remove", {
        userId: "u-1",
      })

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/user/remove",
        expect.objectContaining({
          method: "DELETE",
          body: JSON.stringify({ userId: "u-1" }),
        }),
      )
    })
  })

  describe("delly (DELETE alias)", () => {
    it("is an alias for deletty", async () => {
      mockFetch.mockReturnValue(mockResponse({ ok: true }))

      const { delly } = createClient(schemas)
      await delly("user/delete")

      expect(mockFetch).toHaveBeenCalledWith("/api/user/delete", expect.objectContaining({ method: "DELETE" }))
    })
  })

  describe("pathOverride", () => {
    it("uses pathOverride instead of basePath + endpoint for GET", async () => {
      mockFetch.mockReturnValue(mockResponse({ id: "1", email: "a@b.com" }))

      const { getty } = createClient(schemas)
      await getty("user", undefined, "/custom/user/123")

      expect(mockFetch).toHaveBeenCalledWith("/custom/user/123", expect.anything())
    })

    it("uses pathOverride for POST", async () => {
      mockFetch.mockReturnValue(mockResponse({ ok: true, token: "t" }))

      const { postty } = createClient(schemas)
      await postty("login", { email: "a@b.com", password: "s" }, undefined, "/v2/auth/login")

      expect(mockFetch).toHaveBeenCalledWith("/v2/auth/login", expect.anything())
    })

    it("uses pathOverride for DELETE", async () => {
      mockFetch.mockReturnValue(mockResponse({ ok: true }))

      const { delly } = createClient(schemas)
      await delly("user/delete", undefined, "/api/users/42")

      expect(mockFetch).toHaveBeenCalledWith("/api/users/42", expect.anything())
    })

    it("falls back to default path when pathOverride is undefined", async () => {
      mockFetch.mockReturnValue(mockResponse({ id: "1", email: "a@b.com" }))

      const { getty } = createClient(schemas)
      await getty("user", undefined, undefined)

      expect(mockFetch).toHaveBeenCalledWith("/api/user", expect.anything())
    })
  })

  describe("default headers", () => {
    it("includes default headers in all requests", async () => {
      mockFetch.mockReturnValue(mockResponse({ id: "1", email: "test@example.com" }))

      const { getty } = createClient(schemas, {
        headers: { Authorization: "Bearer token123" },
      })
      await getty("user")

      const call = mockFetch.mock.calls[0]
      expect(call[1].headers.Authorization).toBe("Bearer token123")
    })

    it("per-request headers override defaults", async () => {
      mockFetch.mockReturnValue(mockResponse({ id: "1", email: "test@example.com" }))

      const { getty } = createClient(schemas, {
        headers: { Authorization: "Bearer default" },
      })
      await getty("user", { headers: { Authorization: "Bearer override" } })

      const call = mockFetch.mock.calls[0]
      expect(call[1].headers.Authorization).toBe("Bearer override")
    })
  })
})

describe("ApiError", () => {
  describe("network errors", () => {
    it("throws NETWORK_ERROR on fetch failure", async () => {
      mockFetch.mockRejectedValue(new Error("Network failed"))

      const { getty } = createClient(schemas)

      await expect(getty("user")).rejects.toThrow(ApiError)
      await expect(getty("user")).rejects.toMatchObject({
        code: "NETWORK_ERROR",
        message: "Network error",
      })
    })
  })

  describe("HTTP errors", () => {
    it("throws on 401 with isUnauthorized", async () => {
      mockFetch.mockReturnValue(mockResponse({ error: { message: "Unauthorized" } }, 401))

      const { getty } = createClient(schemas)

      try {
        await getty("user")
        expect.fail("Should have thrown")
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError)
        const err = e as ApiError
        expect(err.status).toBe(401)
        expect(err.isUnauthorized).toBe(true)
        expect(err.message).toBe("Unauthorized")
      }
    })

    it("throws on 403 with isForbidden", async () => {
      mockFetch.mockReturnValue(mockResponse({ message: "Forbidden" }, 403))

      const { getty } = createClient(schemas)

      try {
        await getty("user")
        expect.fail("Should have thrown")
      } catch (e) {
        const err = e as ApiError
        expect(err.status).toBe(403)
        expect(err.isForbidden).toBe(true)
      }
    })

    it("throws on 404 with isNotFound", async () => {
      mockFetch.mockReturnValue(mockResponse({ error: "Not found" }, 404))

      const { getty } = createClient(schemas)

      try {
        await getty("user")
        expect.fail("Should have thrown")
      } catch (e) {
        const err = e as ApiError
        expect(err.status).toBe(404)
        expect(err.isNotFound).toBe(true)
      }
    })

    it("throws on 429 with isRateLimited", async () => {
      mockFetch.mockReturnValue(mockResponse({}, 429))

      const { getty } = createClient(schemas)

      try {
        await getty("user")
        expect.fail("Should have thrown")
      } catch (e) {
        const err = e as ApiError
        expect(err.status).toBe(429)
        expect(err.isRateLimited).toBe(true)
      }
    })

    it("throws on 500 with isServerError", async () => {
      mockFetch.mockReturnValue(mockResponse({}, 500))

      const { getty } = createClient(schemas)

      try {
        await getty("user")
        expect.fail("Should have thrown")
      } catch (e) {
        const err = e as ApiError
        expect(err.status).toBe(500)
        expect(err.isServerError).toBe(true)
      }
    })

    it("handles various error response shapes", async () => {
      // Shape 1: { error: { message, code } }
      mockFetch.mockReturnValue(mockResponse({ error: { message: "Shape 1", code: "ERR1" } }, 400))
      const { getty } = createClient(schemas)

      try {
        await getty("user")
      } catch (e) {
        const err = e as ApiError
        expect(err.message).toBe("Shape 1")
        expect(err.code).toBe("ERR1")
      }

      // Shape 2: { message }
      mockFetch.mockReturnValue(mockResponse({ message: "Shape 2" }, 400))

      try {
        await getty("user")
      } catch (e) {
        const err = e as ApiError
        expect(err.message).toBe("Shape 2")
      }

      // Shape 3: { error: "string" }
      mockFetch.mockReturnValue(mockResponse({ error: "Shape 3" }, 400))

      try {
        await getty("user")
      } catch (e) {
        const err = e as ApiError
        expect(err.message).toBe("Shape 3")
      }
    })

    it("prefers message over error code string", async () => {
      // Shape 4: { ok: false, error: "ERROR_CODE", message: "User-friendly message" }
      // This is the format used by createErrorResponse() in our API
      mockFetch.mockReturnValue(
        mockResponse(
          { ok: false, error: "INTEGRATION_NOT_CONNECTED", message: "You are not connected to Gmail." },
          400,
        ),
      )

      const { getty } = createClient(schemas)

      try {
        await getty("user")
        expect.fail("Should have thrown")
      } catch (e) {
        const err = e as ApiError
        // message should be the user-friendly text, NOT the raw error code
        expect(err.message).toBe("You are not connected to Gmail.")
        // code should be the error code
        expect(err.code).toBe("INTEGRATION_NOT_CONNECTED")
        expect(err.status).toBe(400)
      }
    })
  })

  describe("validation errors", () => {
    it("throws VALIDATION_ERROR on response mismatch", async () => {
      mockFetch.mockReturnValue(mockResponse({ wrong: "shape" }))

      const { getty } = createClient(schemas)

      await expect(getty("user")).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        message: "Response validation failed",
      })
    })

    it("includes Zod issues in details", async () => {
      mockFetch.mockReturnValue(mockResponse({ wrong: "shape" }))

      const { getty } = createClient(schemas)

      try {
        await getty("user")
        expect.fail("Should have thrown")
      } catch (e) {
        const err = e as ApiError
        expect(err.isValidationError).toBe(true)
        expect(Array.isArray(err.details)).toBe(true)
      }
    })

    it("throws REQUEST_VALIDATION_ERROR for invalid request body", async () => {
      const { postty } = createClient(schemas)

      try {
        await postty("login", { email: "invalid", password: "test" })
        expect.fail("Should have thrown")
      } catch (e) {
        const err = e as ApiError
        expect(err.code).toBe("REQUEST_VALIDATION_ERROR")
        expect(err.isValidationError).toBe(true)
        expect(Array.isArray(err.details)).toBe(true)
      }
    })
  })

  describe("parse errors", () => {
    it("wraps non-Zod transform errors in PARSE_ERROR", async () => {
      const transformSchemas = {
        user: {
          res: z.object({ id: z.string() }).transform(() => {
            throw new Error("transform explosion")
          }),
        },
      } satisfies SchemaRegistry

      mockFetch.mockReturnValue(mockResponse({ id: "1" }))

      const { getty } = createClient(transformSchemas)

      await expect(getty("user")).rejects.toMatchObject({
        code: "PARSE_ERROR",
        message: "Response parsing failed",
      })
    })
  })

  describe("non-JSON response", () => {
    it("throws NON_JSON_RESPONSE", async () => {
      mockFetch.mockReturnValue(
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.reject(new Error("Not JSON")),
        }),
      )

      const { getty } = createClient(schemas)

      await expect(getty("user")).rejects.toMatchObject({
        code: "NON_JSON_RESPONSE",
      })
    })
  })

  describe("prototype chain", () => {
    it("maintains instanceof for ApiError", () => {
      const err = new ApiError("test", 500)
      expect(err instanceof ApiError).toBe(true)
      expect(err instanceof Error).toBe(true)
    })
  })
})
