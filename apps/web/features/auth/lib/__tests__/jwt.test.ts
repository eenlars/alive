import { decodeJwt } from "jose"
import { sign, verify } from "jsonwebtoken"
import { describe, expect, it as test } from "vitest"
import { createSessionToken, type SessionPayload, verifySessionToken } from "../jwt"

const JWT_SECRET = process.env.JWT_SECRET || "INSECURE_DEV_SECRET_CHANGE_IN_PRODUCTION"
const ES256_ENABLED = process.env.JWT_ALGORITHM === "ES256"

// Test data for new JWT fields
const TEST_EMAIL = "test@example.com"
const TEST_NAME = "Test User"
const TEST_WORKSPACES = ["example.com", "demo.com"]

describe("JWT Session Token - Security & Behavior", () => {
  describe("Token Creation", () => {
    test("creates token with both 'sub' and 'userId' claims", async () => {
      const userId = "550e8400-e29b-41d4-a716-446655440000"
      const token = await createSessionToken(userId, TEST_EMAIL, TEST_NAME, TEST_WORKSPACES)
      // ES256 tokens must be decoded with jose, HS256 with jsonwebtoken
      const decoded = (ES256_ENABLED ? decodeJwt(token) : verify(token, JWT_SECRET)) as SessionPayload

      expect(decoded.sub).toBe(userId)
      expect(decoded.userId).toBe(userId)
      expect(decoded.email).toBe(TEST_EMAIL)
      expect(decoded.name).toBe(TEST_NAME)
      expect(decoded.workspaces).toEqual(TEST_WORKSPACES)
    })

    test("should reject empty userId at creation", async () => {
      // This tests our contract - we should never create tokens with empty IDs
      await expect(createSessionToken("", TEST_EMAIL, TEST_NAME, TEST_WORKSPACES)).rejects.toThrow()
    })

    test("should accept custom user ID formats (e.g., user_* from Supabase)", async () => {
      // Custom user IDs (e.g., user_33z3p1weXBN1Ns1PVy6kygwzdcU) should be accepted
      const customUserId = "user_33z3p1weXBN1Ns1PVy6kygwzdcU"
      const token = await createSessionToken(customUserId, TEST_EMAIL, TEST_NAME, TEST_WORKSPACES)
      const decoded = (ES256_ENABLED ? decodeJwt(token) : verify(token, JWT_SECRET)) as SessionPayload

      expect(decoded.sub).toBe(customUserId)
      expect(decoded.userId).toBe(customUserId)
      expect(decoded.email).toBe(TEST_EMAIL)
      expect(decoded.name).toBe(TEST_NAME)
      expect(decoded.workspaces).toEqual(TEST_WORKSPACES)
    })
  })

  describe("Token Verification - Format Validation", () => {
    test("rejects old tokens without email/workspaces (no backward compatibility)", async () => {
      const userId = "550e8400-e29b-41d4-a716-446655440000"

      // Old token format (missing email and workspaces) - should be REJECTED
      const oldToken = sign({ userId }, JWT_SECRET, { expiresIn: "30d" })

      const payload = await verifySessionToken(oldToken)

      // Should reject - user must re-login to get new token
      expect(payload).toBeNull()
    })

    test("accepts new tokens with all required fields", async () => {
      const userId = "550e8400-e29b-41d4-a716-446655440000"
      const token = await createSessionToken(userId, TEST_EMAIL, TEST_NAME, TEST_WORKSPACES)
      const payload = await verifySessionToken(token)

      expect(payload?.sub).toBe(userId)
      expect(payload?.userId).toBe(userId)
      expect(payload?.email).toBe(TEST_EMAIL)
      expect(payload?.workspaces).toEqual(TEST_WORKSPACES)
    })

    test("rejects tokens missing workspaces field", async () => {
      const userId = "550e8400-e29b-41d4-a716-446655440000"

      // Token with email but missing workspaces
      const invalidToken = sign({ sub: userId, userId, email: TEST_EMAIL, name: TEST_NAME }, JWT_SECRET, {
        expiresIn: "30d",
      })

      const payload = await verifySessionToken(invalidToken)

      expect(payload).toBeNull()
    })
  })

  describe("Token Verification - Security", () => {
    test("rejects token with mismatched 'sub' and 'userId' (corruption detection)", async () => {
      const token = sign(
        {
          sub: "550e8400-e29b-41d4-a716-446655440000",
          userId: "different-user-id-here",
        },
        JWT_SECRET,
        { expiresIn: "30d" },
      )

      const payload = await verifySessionToken(token)

      // Should reject corrupted tokens where sub ≠ userId
      expect(payload).toBeNull()
    })

    test("rejects token with empty 'sub' claim", async () => {
      const token = sign({ sub: "", userId: "" }, JWT_SECRET, { expiresIn: "30d" })

      const payload = await verifySessionToken(token)
      expect(payload).toBeNull()
    })

    test("rejects token with null 'sub' claim", async () => {
      const token = sign({ sub: null, userId: null }, JWT_SECRET, { expiresIn: "30d" })

      const payload = await verifySessionToken(token)
      expect(payload).toBeNull()
    })

    test("rejects token with non-string 'sub' claim", async () => {
      const token = sign({ sub: 12345, userId: 12345 }, JWT_SECRET, { expiresIn: "30d" })

      const payload = await verifySessionToken(token)
      expect(payload).toBeNull()
    })

    test("rejects tampered token signature", async () => {
      const token = await createSessionToken(
        "550e8400-e29b-41d4-a716-446655440000",
        TEST_EMAIL,
        TEST_NAME,
        TEST_WORKSPACES,
      )

      // Tamper with signature
      const parts = token.split(".")
      const tamperedToken = `${parts[0]}.${parts[1]}.${parts[2]}TAMPERED`

      const payload = await verifySessionToken(tamperedToken)
      expect(payload).toBeNull()
    })

    test("rejects tampered 'sub' claim in payload", async () => {
      const token = await createSessionToken(
        "550e8400-e29b-41d4-a716-446655440000",
        TEST_EMAIL,
        TEST_NAME,
        TEST_WORKSPACES,
      )

      // Tamper with payload
      const parts = token.split(".")
      const tamperedPayload = Buffer.from(
        JSON.stringify({
          sub: "hacker-uuid",
          userId: "hacker-uuid",
        }),
      ).toString("base64url")
      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`

      const payload = await verifySessionToken(tamperedToken)
      expect(payload).toBeNull() // Signature won't match
    })

    test("rejects expired token", async () => {
      const token = sign(
        {
          sub: "550e8400-e29b-41d4-a716-446655440000",
          userId: "550e8400-e29b-41d4-a716-446655440000",
        },
        JWT_SECRET,
        { expiresIn: "0s" }, // Already expired
      )

      // Wait a bit to ensure expiry
      const payload = await verifySessionToken(token)
      expect(payload).toBeNull()
    })

    test("rejects malformed JWT", async () => {
      expect(await verifySessionToken("not.a.jwt")).toBeNull()
      expect(await verifySessionToken("invalid")).toBeNull()
      expect(await verifySessionToken("")).toBeNull()
    })

    test("rejects token signed with wrong secret", async () => {
      const token = sign(
        {
          sub: "550e8400-e29b-41d4-a716-446655440000",
          userId: "550e8400-e29b-41d4-a716-446655440000",
        },
        "wrong-secret",
        { expiresIn: "30d" },
      )

      const payload = await verifySessionToken(token)
      expect(payload).toBeNull()
    })
  })

  describe("RLS Integration - What Supabase Sees", () => {
    test("token payload is compatible with Supabase JWT expectations", async () => {
      const userId = "550e8400-e29b-41d4-a716-446655440000"
      const token = await createSessionToken(userId, TEST_EMAIL, TEST_NAME, TEST_WORKSPACES)
      const decoded = (ES256_ENABLED ? decodeJwt(token) : verify(token, JWT_SECRET)) as SessionPayload

      // Supabase expects 'sub' claim for RLS
      expect(decoded.sub).toBe(userId)
      expect(typeof decoded.sub).toBe("string")

      // Verify it's a valid UUID format (Supabase casts to UUID)
      expect(decoded.sub).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    })

    test("token has standard JWT claims (iat, exp)", async () => {
      const token = await createSessionToken(
        "550e8400-e29b-41d4-a716-446655440000",
        TEST_EMAIL,
        TEST_NAME,
        TEST_WORKSPACES,
      )
      const decoded = (ES256_ENABLED ? decodeJwt(token) : verify(token, JWT_SECRET)) as SessionPayload

      expect(decoded.iat).toBeDefined()
      expect(decoded.exp).toBeDefined()
      expect(typeof decoded.iat).toBe("number")
      expect(typeof decoded.exp).toBe("number")
    })

    test("token expiry is exactly 30 days", async () => {
      const token = await createSessionToken(
        "550e8400-e29b-41d4-a716-446655440000",
        TEST_EMAIL,
        TEST_NAME,
        TEST_WORKSPACES,
      )
      const decoded = (ES256_ENABLED ? decodeJwt(token) : verify(token, JWT_SECRET)) as SessionPayload

      const expiresIn = decoded.exp! - decoded.iat!
      expect(expiresIn).toBe(30 * 24 * 60 * 60) // 30 days in seconds
    })
  })

  describe("Edge Cases", () => {
    test("handles UUID with uppercase letters", async () => {
      const userId = "550E8400-E29B-41D4-A716-446655440000"
      const token = await createSessionToken(userId, TEST_EMAIL, TEST_NAME, TEST_WORKSPACES)
      const payload = await verifySessionToken(token)

      expect(payload?.sub).toBe(userId)
      expect(payload?.userId).toBe(userId)
    })

    test("preserves UUID format exactly as provided", async () => {
      const userId = "550e8400-e29b-41d4-a716-446655440000"
      const token = await createSessionToken(userId, TEST_EMAIL, TEST_NAME, TEST_WORKSPACES)
      const payload = await verifySessionToken(token)

      // Should not modify the UUID format
      expect(payload?.sub).toBe(userId)
      expect(payload?.userId).toBe(userId)
    })

    test("rejects SQL injection attempt in userId", async () => {
      const maliciousId = "'; DROP TABLE users; --"

      // Should either throw or create token that gets rejected
      await expect(createSessionToken(maliciousId, TEST_EMAIL, TEST_NAME, TEST_WORKSPACES)).rejects.toThrow()
    })

    test("rejects path traversal attempt in userId", async () => {
      const maliciousId = "../../../etc/passwd"

      await expect(createSessionToken(maliciousId, TEST_EMAIL, TEST_NAME, TEST_WORKSPACES)).rejects.toThrow()
    })
  })
})
