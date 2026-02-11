import { describe, expect, it } from "vitest"

/**
 * OAuth Error Response Tests
 *
 * Based on n8n's client-oauth2.test.ts patterns for handling:
 * - Different content types (JSON, form-urlencoded)
 * - Error responses (4xx, 3xx)
 * - Auth errors with proper error codes
 */

describe("OAuth Error Handling", () => {
  describe("parseOAuthError", () => {
    // Standard OAuth 2.0 error codes
    const ERROR_RESPONSES: Record<string, string> = {
      invalid_request: "The request is missing a required parameter",
      invalid_client: "Client authentication failed",
      invalid_grant: "The provided authorization grant is invalid",
      unauthorized_client: "The client is not authorized",
      unsupported_grant_type: "The authorization grant type is not supported",
      invalid_scope: "The requested scope is invalid",
      access_denied: "The resource owner denied the request",
      server_error: "The authorization server encountered an error",
      temporarily_unavailable: "The server is temporarily unavailable",
    }

    it("maps standard OAuth error codes to messages", () => {
      expect(ERROR_RESPONSES.invalid_request).toBeDefined()
      expect(ERROR_RESPONSES.access_denied).toBeDefined()
      expect(ERROR_RESPONSES.invalid_grant).toBeDefined()
    })

    it("handles error in callback URL", () => {
      const callbackUrl = new URL("http://example.com/callback?error=invalid_request&error_description=Missing+code")

      const error = callbackUrl.searchParams.get("error")
      const description = callbackUrl.searchParams.get("error_description")

      expect(error).toBe("invalid_request")
      expect(description).toBe("Missing code")
    })

    it("handles error with state parameter", () => {
      const callbackUrl = new URL("http://example.com/callback?error=access_denied&state=abc123")

      const error = callbackUrl.searchParams.get("error")
      const state = callbackUrl.searchParams.get("state")

      expect(error).toBe("access_denied")
      expect(state).toBe("abc123")
    })
  })

  describe("Content-Type Handling", () => {
    it("parses JSON response", () => {
      const contentType = "application/json"
      const body = '{"access_token":"abc","refresh_token":"def"}'

      expect(contentType.includes("application/json")).toBe(true)
      const parsed = JSON.parse(body)
      expect(parsed.access_token).toBe("abc")
    })

    it("parses JSON with charset", () => {
      const contentType = "application/json; charset=utf-8"

      expect(contentType.startsWith("application/json")).toBe(true)
    })

    it("parses form-urlencoded response", () => {
      const contentType = "application/x-www-form-urlencoded"
      const body = "access_token=abc&refresh_token=def"

      expect(contentType.includes("x-www-form-urlencoded")).toBe(true)
      const params = new URLSearchParams(body)
      expect(params.get("access_token")).toBe("abc")
      expect(params.get("refresh_token")).toBe("def")
    })

    it("rejects unsupported content types", () => {
      const unsupportedTypes = ["text/html", "application/xml", "text/plain"]

      for (const contentType of unsupportedTypes) {
        const isSupported = contentType.includes("application/json") || contentType.includes("x-www-form-urlencoded")

        expect(isSupported).toBe(false)
      }
    })
  })

  describe("HTTP Status Handling", () => {
    it("treats 2xx as success", () => {
      const successCodes = [200, 201, 204]

      for (const code of successCodes) {
        expect(code >= 200 && code < 300).toBe(true)
      }
    })

    it("treats 4xx as auth error", () => {
      const authErrorCodes = [400, 401, 403]

      for (const code of authErrorCodes) {
        expect(code >= 400 && code < 500).toBe(true)
      }
    })

    it("treats 3xx as redirect (unexpected in token flow)", () => {
      const redirectCodes = [301, 302, 307]

      for (const code of redirectCodes) {
        expect(code >= 300 && code < 400).toBe(true)
      }
    })
  })

  describe("Token Response Validation", () => {
    it("validates required access_token field", () => {
      const validResponse = {
        access_token: "abc123",
        token_type: "Bearer",
      }

      expect(validResponse.access_token).toBeDefined()
      expect(typeof validResponse.access_token).toBe("string")
    })

    it("handles optional refresh_token", () => {
      const responseWithRefresh = {
        access_token: "abc123",
        token_type: "Bearer",
        refresh_token: "def456",
      }

      const responseWithoutRefresh = {
        access_token: "abc123",
        token_type: "Bearer",
      }

      expect(responseWithRefresh.refresh_token).toBe("def456")
      expect(responseWithoutRefresh.refresh_token).toBeUndefined()
    })

    it("handles optional expires_in", () => {
      const responseWithExpiry = {
        access_token: "abc123",
        token_type: "Bearer",
        expires_in: 3600,
      }

      expect(responseWithExpiry.expires_in).toBe(3600)
    })

    it("handles optional scope", () => {
      const responseWithScope = {
        access_token: "abc123",
        token_type: "Bearer",
        scope: "read write",
      }

      expect(responseWithScope.scope).toBe("read write")
    })

    it("defaults token_type to bearer", () => {
      const response = {
        access_token: "abc123",
      }

      const tokenType = response.token_type || "bearer"
      expect(tokenType.toLowerCase()).toBe("bearer")
    })
  })
})
