import { describe, expect, it } from "vitest"
import { BodySchema, LoginSchema } from "@/types/guards/api"

describe("API Request Validation Guards", () => {
  describe("BodySchema (Claude API request)", () => {
    // tabId is now required, conversationId is optional
    const validTabId = "660e8400-e29b-41d4-a716-446655440001"
    const validTabGroupId = "11111111-1111-1111-1111-111111111111"
    const validConversationId = "550e8400-e29b-41d4-a716-446655440000"

    it("should accept valid request body", () => {
      const validBody = {
        message: "Hello Claude",
        tabId: validTabId,
        tabGroupId: validTabGroupId,
        conversationId: validConversationId,
        workspace: "example.com",
      }

      const result = BodySchema.safeParse(validBody)
      expect(result.success).toBe(true)
    })

    it("should require message field", () => {
      const invalidBody = {
        tabId: validTabId,
        tabGroupId: validTabGroupId,
      }

      const result = BodySchema.safeParse(invalidBody)
      expect(result.success).toBe(false)
    })

    it("should reject empty messages", () => {
      const invalidBody = {
        message: "",
        tabId: validTabId,
        tabGroupId: validTabGroupId,
      }

      const result = BodySchema.safeParse(invalidBody)
      expect(result.success).toBe(false)
    })

    it("should reject non-string messages", () => {
      const invalidBodies = [
        { message: 123, tabId: validTabId, tabGroupId: validTabGroupId },
        { message: null, tabId: validTabId, tabGroupId: validTabGroupId },
        { message: undefined, tabId: validTabId, tabGroupId: validTabGroupId },
        { message: {}, tabId: validTabId, tabGroupId: validTabGroupId },
      ]

      for (const body of invalidBodies) {
        const result = BodySchema.safeParse(body)
        expect(result.success, `Should reject: ${JSON.stringify(body)}`).toBe(false)
      }
    })

    it("should require tabId", () => {
      const invalidBody = {
        message: "Hello",
        tabGroupId: validTabGroupId,
      }

      const result = BodySchema.safeParse(invalidBody)
      expect(result.success).toBe(false)
    })

    it("should require tabId to be valid UUID", () => {
      const invalidIds = [
        { message: "Hello", tabId: "not-a-uuid", tabGroupId: validTabGroupId },
        { message: "Hello", tabId: "12345", tabGroupId: validTabGroupId },
        { message: "Hello", tabId: "", tabGroupId: validTabGroupId },
      ]

      for (const body of invalidIds) {
        const result = BodySchema.safeParse(body)
        expect(result.success, `Should reject invalid UUID: ${body.tabId}`).toBe(false)
      }
    })

    it("should accept optional workspace parameter", () => {
      const withWorkspace = {
        message: "Hello",
        tabId: validTabId,
        tabGroupId: validTabGroupId,
        workspace: "example.com",
      }

      const withoutWorkspace = {
        message: "Hello",
        tabId: validTabId,
        tabGroupId: validTabGroupId,
      }

      expect(BodySchema.safeParse(withWorkspace).success).toBe(true)
      expect(BodySchema.safeParse(withoutWorkspace).success).toBe(true)
    })

    it("should handle extremely long messages without crashing", () => {
      const tooLong = {
        message: "a".repeat(1_000_001),
        tabId: validTabId,
        tabGroupId: validTabGroupId,
      }

      expect(() => BodySchema.safeParse(tooLong)).not.toThrow()
    })

    it("should accept messages with special characters", () => {
      const specialMessages = [
        { message: "<script>alert('xss')</script>", tabId: validTabId, tabGroupId: validTabGroupId },
        { message: "'; DROP TABLE users; --", tabId: validTabId, tabGroupId: validTabGroupId },
        { message: "test\x00null", tabId: validTabId, tabGroupId: validTabGroupId },
      ]

      for (const body of specialMessages) {
        expect(() => BodySchema.safeParse(body)).not.toThrow()
      }
    })
  })

  describe("LoginSchema", () => {
    it("should accept valid login credentials", () => {
      const validLogin = {
        passcode: "supersecret",
        workspace: "example.com",
      }

      const result = LoginSchema.safeParse(validLogin)
      expect(result.success).toBe(true)
    })

    it("should accept missing optional fields", () => {
      const onlyPasscode = { passcode: "supersecret" }
      const onlyWorkspace = { workspace: "example.com" }
      const emptyObject = {}

      expect(LoginSchema.safeParse(onlyPasscode).success).toBe(true)
      expect(LoginSchema.safeParse(onlyWorkspace).success).toBe(true)
      expect(LoginSchema.safeParse(emptyObject).success).toBe(true)
    })

    it("should reject non-string when provided", () => {
      const invalidLogins = [{ passcode: 123 }, { workspace: 456 }, { passcode: null }, { workspace: null }]

      for (const login of invalidLogins) {
        const result = LoginSchema.safeParse(login)
        expect(result.success, `Should reject: ${JSON.stringify(login)}`).toBe(false)
      }
    })

    it("should accept string values for workspace", () => {
      const sqlInjection = {
        passcode: "supersecret",
        workspace: "example.com'; DROP TABLE users; --",
      }

      const result = LoginSchema.safeParse(sqlInjection)
      expect(result.success).toBe(true)
    })

    it("should accept any string for workspace field", () => {
      const pathTraversal = {
        passcode: "supersecret",
        workspace: "../../etc/passwd",
      }

      const result = LoginSchema.safeParse(pathTraversal)
      expect(result.success).toBe(true)
    })
  })

  describe("Request Sanitization", () => {
    const validTabId = "660e8400-e29b-41d4-a716-446655440001"
    const validTabGroupId = "11111111-1111-1111-1111-111111111111"

    it("should strip unexpected fields from valid requests", () => {
      const bodyWithExtra = {
        message: "Hello",
        tabId: validTabId,
        tabGroupId: validTabGroupId,
        extraField: "should be stripped",
      }

      const result = BodySchema.safeParse(bodyWithExtra)
      if (result.success) {
        expect(result.data).not.toHaveProperty("extraField")
      }
    })

    it("should handle null prototype objects", () => {
      const nullProtoBody = Object.create(null)
      nullProtoBody.message = "Hello"
      nullProtoBody.tabId = validTabId
      nullProtoBody.tabGroupId = validTabGroupId

      expect(() => BodySchema.safeParse(nullProtoBody)).not.toThrow()
    })

    it("should handle circular references without crashing", () => {
      interface CircularBody {
        message: string
        tabId: string
        tabGroupId: string
        self?: CircularBody
      }

      const circular: CircularBody = {
        message: "Hello",
        tabId: validTabId,
        tabGroupId: validTabGroupId,
      }
      circular.self = circular

      expect(() => BodySchema.safeParse(circular)).not.toThrow()
    })
  })

  describe("Performance & DoS Prevention", () => {
    const validTabId = "660e8400-e29b-41d4-a716-446655440001"
    const validTabGroupId = "11111111-1111-1111-1111-111111111111"

    it("should handle deeply nested objects without stack overflow", () => {
      interface DeepObject {
        message?: string
        tabId?: string
        tabGroupId?: string
        nested?: DeepObject
      }

      let deepObject: DeepObject = { message: "Hello", tabId: validTabId, tabGroupId: validTabGroupId }
      for (let i = 0; i < 100; i++) {
        deepObject = { nested: deepObject }
      }

      expect(() => BodySchema.safeParse(deepObject)).not.toThrow()
    })

    it("should handle large objects efficiently", () => {
      const largeObject = {
        message: "Hello",
        tabId: validTabId,
        tabGroupId: validTabGroupId,
        extra: Array(1000).fill("item"),
      }

      const start = Date.now()
      BodySchema.safeParse(largeObject)
      const duration = Date.now() - start

      expect(duration).toBeLessThan(1000)
    })
  })
})
