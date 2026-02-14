import { decodeJwt } from "jose"
import { sign, verify } from "jsonwebtoken"
import { describe, expect, it as test } from "vitest"
import {
  createSessionToken,
  DEFAULT_USER_SCOPES,
  SESSION_SCOPES,
  type SessionPayloadV3,
  verifySessionToken,
} from "../jwt"

const JWT_SECRET = process.env.JWT_SECRET || "INSECURE_DEV_SECRET_CHANGE_IN_PRODUCTION"
const ES256_ENABLED = process.env.JWT_ALGORITHM === "ES256"

const TEST_EMAIL = "test@example.com"
const TEST_NAME = "Test User"
const TEST_ORG_ID = "org_test_123"
const TEST_ORG_IDS = [TEST_ORG_ID, "org_test_456"]
const TEST_ORG_ROLES = {
  [TEST_ORG_IDS[0]]: "owner" as const,
  [TEST_ORG_IDS[1]]: "member" as const,
}
const TEST_SCOPES = [SESSION_SCOPES.WORKSPACE_ACCESS, SESSION_SCOPES.WORKSPACE_LIST, SESSION_SCOPES.ORG_READ] as const

function decodeToken(token: string): SessionPayloadV3 {
  return (ES256_ENABLED ? decodeJwt(token) : verify(token, JWT_SECRET)) as SessionPayloadV3
}

function buildTokenInput(userId: string) {
  return {
    userId,
    email: TEST_EMAIL,
    name: TEST_NAME,
    scopes: [...TEST_SCOPES],
    orgIds: [...TEST_ORG_IDS],
    orgRoles: { ...TEST_ORG_ROLES },
  }
}

describe("JWT Session Token v3 - Security & Behavior", () => {
  describe("Token Creation", () => {
    test("creates token with v3 claims", async () => {
      const userId = "550e8400-e29b-41d4-a716-446655440000"
      const token = await createSessionToken(buildTokenInput(userId))
      const decoded = decodeToken(token)

      expect(decoded.role).toBe("authenticated")
      expect(decoded.sub).toBe(userId)
      expect(decoded.userId).toBe(userId)
      expect(decoded.email).toBe(TEST_EMAIL)
      expect(decoded.name).toBe(TEST_NAME)
      expect(decoded.scopes).toEqual(TEST_SCOPES)
      expect(decoded.orgIds).toEqual(TEST_ORG_IDS)
      expect(decoded.orgRoles).toEqual(TEST_ORG_ROLES)
      expect(decoded.workspaces).toBeUndefined()
    })

    test("uses default scopes when scopes are omitted", async () => {
      const token = await createSessionToken({
        userId: "550e8400-e29b-41d4-a716-446655440000",
        email: TEST_EMAIL,
        name: TEST_NAME,
        orgIds: [TEST_ORG_ID],
        orgRoles: { [TEST_ORG_ID]: "owner" },
      })
      const decoded = decodeToken(token)
      expect(decoded.scopes).toEqual(DEFAULT_USER_SCOPES)
    })

    test("should reject empty userId at creation", async () => {
      await expect(createSessionToken(buildTokenInput(""))).rejects.toThrow()
    })

    test("should accept custom user ID formats", async () => {
      const customUserId = "user_33z3p1weXBN1Ns1PVy6kygwzdcU"
      const token = await createSessionToken(buildTokenInput(customUserId))
      const decoded = decodeToken(token)

      expect(decoded.sub).toBe(customUserId)
      expect(decoded.userId).toBe(customUserId)
    })

    test("keeps token size well below cookie risk range for typical auth context", async () => {
      const token = await createSessionToken({
        userId: "550e8400-e29b-41d4-a716-446655440000",
        email: TEST_EMAIL,
        name: TEST_NAME,
        scopes: [...TEST_SCOPES],
        orgIds: ["org_a", "org_b", "org_c"],
        orgRoles: {
          org_a: "owner",
          org_b: "admin",
          org_c: "member",
        },
      })

      // 4KB cookie limit includes key/attributes. Keep JWT comfortably below that.
      expect(token.length).toBeLessThan(1200)
    })
  })

  describe("Token Verification - Format Validation", () => {
    test("rejects old tokens without v3 claims", async () => {
      const userId = "550e8400-e29b-41d4-a716-446655440000"
      const oldToken = sign({ userId, email: TEST_EMAIL, name: TEST_NAME }, JWT_SECRET, { expiresIn: "30d" })

      const payload = await verifySessionToken(oldToken)
      expect(payload).toBeNull()
    })

    test("accepts new tokens with all required fields", async () => {
      const userId = "550e8400-e29b-41d4-a716-446655440000"
      const token = await createSessionToken(buildTokenInput(userId))
      const payload = await verifySessionToken(token)

      expect(payload?.role).toBe("authenticated")
      expect(payload?.sub).toBe(userId)
      expect(payload?.userId).toBe(userId)
      expect(payload?.email).toBe(TEST_EMAIL)
      expect(payload?.scopes).toEqual(TEST_SCOPES)
      expect(payload?.orgIds).toEqual(TEST_ORG_IDS)
      expect(payload?.orgRoles).toEqual(TEST_ORG_ROLES)
    })

    test("rejects tokens missing role", async () => {
      const userId = "550e8400-e29b-41d4-a716-446655440000"
      const invalidToken = sign(
        {
          sub: userId,
          userId,
          email: TEST_EMAIL,
          name: TEST_NAME,
          scopes: TEST_SCOPES,
          orgIds: [TEST_ORG_ID],
          orgRoles: { [TEST_ORG_ID]: "owner" },
        },
        JWT_SECRET,
        { expiresIn: "30d" },
      )

      expect(await verifySessionToken(invalidToken)).toBeNull()
    })

    test("rejects tokens missing sub", async () => {
      const userId = "550e8400-e29b-41d4-a716-446655440000"
      const invalidToken = sign(
        {
          role: "authenticated",
          userId,
          email: TEST_EMAIL,
          name: TEST_NAME,
          scopes: TEST_SCOPES,
          orgIds: [TEST_ORG_ID],
          orgRoles: { [TEST_ORG_ID]: "owner" },
        },
        JWT_SECRET,
        { expiresIn: "30d" },
      )

      expect(await verifySessionToken(invalidToken)).toBeNull()
    })

    test("rejects tokens missing userId", async () => {
      const userId = "550e8400-e29b-41d4-a716-446655440000"
      const invalidToken = sign(
        {
          role: "authenticated",
          sub: userId,
          email: TEST_EMAIL,
          name: TEST_NAME,
          scopes: TEST_SCOPES,
          orgIds: [TEST_ORG_ID],
          orgRoles: { [TEST_ORG_ID]: "owner" },
        },
        JWT_SECRET,
        { expiresIn: "30d" },
      )

      expect(await verifySessionToken(invalidToken)).toBeNull()
    })

    test("rejects tokens missing scopes", async () => {
      const userId = "550e8400-e29b-41d4-a716-446655440000"
      const invalidToken = sign(
        {
          role: "authenticated",
          sub: userId,
          userId,
          email: TEST_EMAIL,
          name: TEST_NAME,
          orgIds: [TEST_ORG_ID],
          orgRoles: TEST_ORG_ROLES,
        },
        JWT_SECRET,
        { expiresIn: "30d" },
      )

      expect(await verifySessionToken(invalidToken)).toBeNull()
    })

    test("rejects tokens missing orgIds", async () => {
      const userId = "550e8400-e29b-41d4-a716-446655440000"
      const invalidToken = sign(
        {
          role: "authenticated",
          sub: userId,
          userId,
          email: TEST_EMAIL,
          name: TEST_NAME,
          scopes: TEST_SCOPES,
          orgRoles: TEST_ORG_ROLES,
        },
        JWT_SECRET,
        { expiresIn: "30d" },
      )

      expect(await verifySessionToken(invalidToken)).toBeNull()
    })

    test("rejects tokens missing orgRoles", async () => {
      const userId = "550e8400-e29b-41d4-a716-446655440000"
      const invalidToken = sign(
        {
          role: "authenticated",
          sub: userId,
          userId,
          email: TEST_EMAIL,
          name: TEST_NAME,
          scopes: TEST_SCOPES,
          orgIds: [TEST_ORG_ID],
        },
        JWT_SECRET,
        { expiresIn: "30d" },
      )

      expect(await verifySessionToken(invalidToken)).toBeNull()
    })

    test("rejects inconsistent orgIds/orgRoles shape", async () => {
      const userId = "550e8400-e29b-41d4-a716-446655440000"
      const invalidToken = sign(
        {
          role: "authenticated",
          sub: userId,
          userId,
          email: TEST_EMAIL,
          name: TEST_NAME,
          scopes: TEST_SCOPES,
          orgIds: [TEST_ORG_ID],
          orgRoles: { [TEST_ORG_ID]: "owner", orphan_org: "member" },
        },
        JWT_SECRET,
        { expiresIn: "30d" },
      )

      expect(await verifySessionToken(invalidToken)).toBeNull()
    })
  })

  describe("Token Verification - Security", () => {
    test("rejects token with mismatched 'sub' and 'userId'", async () => {
      const token = sign(
        {
          role: "authenticated",
          sub: "550e8400-e29b-41d4-a716-446655440000",
          userId: "different-user-id-here",
          email: TEST_EMAIL,
          name: TEST_NAME,
          scopes: TEST_SCOPES,
          orgIds: [TEST_ORG_ID],
          orgRoles: { [TEST_ORG_ID]: "owner" },
        },
        JWT_SECRET,
        { expiresIn: "30d" },
      )

      expect(await verifySessionToken(token)).toBeNull()
    })

    test("rejects tampered token signature", async () => {
      const token = await createSessionToken(buildTokenInput("550e8400-e29b-41d4-a716-446655440000"))
      const parts = token.split(".")
      const tamperedToken = `${parts[0]}.${parts[1]}.${parts[2]}TAMPERED`

      expect(await verifySessionToken(tamperedToken)).toBeNull()
    })

    test("rejects expired token", async () => {
      const token = sign(
        {
          role: "authenticated",
          sub: "550e8400-e29b-41d4-a716-446655440000",
          userId: "550e8400-e29b-41d4-a716-446655440000",
          email: TEST_EMAIL,
          name: TEST_NAME,
          scopes: TEST_SCOPES,
          orgIds: [TEST_ORG_ID],
          orgRoles: { [TEST_ORG_ID]: "owner" },
        },
        JWT_SECRET,
        { expiresIn: "0s" },
      )

      expect(await verifySessionToken(token)).toBeNull()
    })

    test("rejects malformed JWT", async () => {
      expect(await verifySessionToken("not.a.jwt")).toBeNull()
      expect(await verifySessionToken("invalid")).toBeNull()
      expect(await verifySessionToken("")).toBeNull()
    })
  })

  describe("RLS Integration", () => {
    test("token payload keeps standard claims", async () => {
      const userId = "550e8400-e29b-41d4-a716-446655440000"
      const token = await createSessionToken(buildTokenInput(userId))
      const decoded = decodeToken(token)

      expect(decoded.sub).toBe(userId)
      expect(typeof decoded.sub).toBe("string")
      expect(decoded.iat).toBeDefined()
      expect(decoded.exp).toBeDefined()
      expect(decoded.exp! - decoded.iat!).toBe(30 * 24 * 60 * 60)
    })
  })

  describe("Edge Cases", () => {
    test("rejects SQL injection attempt in userId", async () => {
      const maliciousId = "'; DROP TABLE users; --"
      await expect(createSessionToken(buildTokenInput(maliciousId))).rejects.toThrow()
    })

    test("rejects path traversal attempt in userId", async () => {
      const maliciousId = "../../../etc/passwd"
      await expect(createSessionToken(buildTokenInput(maliciousId))).rejects.toThrow()
    })
  })
})
