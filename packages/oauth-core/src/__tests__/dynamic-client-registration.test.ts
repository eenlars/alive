import { describe, expect, it } from "vitest"
import { type AuthorizationServerMetadata, selectBestAuthMethod } from "../dynamic-client-registration"

describe("Dynamic Client Registration", () => {
  describe("selectBestAuthMethod", () => {
    it("prefers PKCE when S256 is supported", () => {
      const result = selectBestAuthMethod(
        ["authorization_code", "refresh_token"],
        ["client_secret_basic", "client_secret_post"],
        ["S256", "plain"],
      )

      expect(result.grantType).toBe("pkce")
      expect(result.authMethod).toBe("none")
    })

    it("falls back to authorization_code with client_secret_basic", () => {
      const result = selectBestAuthMethod(
        ["authorization_code", "refresh_token"],
        ["client_secret_basic", "client_secret_post"],
        [], // No PKCE support
      )

      expect(result.grantType).toBe("authorization_code")
      expect(result.authMethod).toBe("client_secret_basic")
    })

    it("falls back to client_secret_post when basic not available", () => {
      const result = selectBestAuthMethod(
        ["authorization_code", "refresh_token"],
        ["client_secret_post"], // No basic
        [],
      )

      expect(result.grantType).toBe("authorization_code")
      expect(result.authMethod).toBe("client_secret_post")
    })

    it("supports client_credentials flow", () => {
      const result = selectBestAuthMethod(["client_credentials"], ["client_secret_basic"], [])

      expect(result.grantType).toBe("client_credentials")
      expect(result.authMethod).toBe("client_secret_basic")
    })

    it("throws when no supported grant type found", () => {
      expect(() =>
        selectBestAuthMethod(
          ["implicit"], // Unsupported
          ["client_secret_basic"],
          [],
        ),
      ).toThrow("No supported grant type and authentication method found")
    })
  })

  describe("PKCE support detection", () => {
    it("detects PKCE support from code_challenge_methods_supported", () => {
      const metadata: AuthorizationServerMetadata = {
        authorization_endpoint: "https://auth.example.com/authorize",
        token_endpoint: "https://auth.example.com/token",
        registration_endpoint: "https://auth.example.com/register",
        code_challenge_methods_supported: ["S256", "plain"],
      }

      expect(metadata.code_challenge_methods_supported).toContain("S256")
    })

    it("handles servers without PKCE support", () => {
      const metadata: AuthorizationServerMetadata = {
        authorization_endpoint: "https://auth.example.com/authorize",
        token_endpoint: "https://auth.example.com/token",
        registration_endpoint: "https://auth.example.com/register",
      }

      expect(metadata.code_challenge_methods_supported).toBeUndefined()
    })
  })

  describe("Authorization Server Metadata schema", () => {
    it("accepts valid metadata with optional fields", () => {
      const metadata: AuthorizationServerMetadata = {
        authorization_endpoint: "https://auth.example.com/authorize",
        token_endpoint: "https://auth.example.com/token",
        registration_endpoint: "https://auth.example.com/register",
        issuer: "https://auth.example.com",
        scopes_supported: ["openid", "profile", "email"],
        response_types_supported: ["code", "token"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        token_endpoint_auth_methods_supported: ["client_secret_basic"],
        code_challenge_methods_supported: ["S256"],
      }

      expect(metadata.issuer).toBe("https://auth.example.com")
      expect(metadata.scopes_supported).toContain("openid")
    })

    it("works with minimal required fields", () => {
      const metadata: AuthorizationServerMetadata = {
        authorization_endpoint: "https://auth.example.com/authorize",
        token_endpoint: "https://auth.example.com/token",
        registration_endpoint: "https://auth.example.com/register",
      }

      expect(metadata.authorization_endpoint).toBeDefined()
      expect(metadata.token_endpoint).toBeDefined()
      expect(metadata.registration_endpoint).toBeDefined()
    })
  })
})
