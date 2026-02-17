import { describe, expect, it } from "vitest"
import { BodySchema } from "@/types/guards/api"

describe("BodySchema auth key handling", () => {
  const validTabId = "660e8400-e29b-41d4-a716-446655440001"
  const validTabGroupId = "11111111-1111-4111-8111-111111111111"

  const baseBody = {
    message: "Hello, Claude",
    tabId: validTabId,
    tabGroupId: validTabGroupId,
  }

  it("accepts requests without apiKey", () => {
    const result = BodySchema.safeParse(baseBody)
    expect(result.success).toBe(true)
  })

  it("ignores apiKey when present and strips it from parsed output", () => {
    const bodyWithApiKey = {
      ...baseBody,
      apiKey: "sk-ant-this-should-be-ignored",
    }

    const result = BodySchema.safeParse(bodyWithApiKey)
    expect(result.success).toBe(true)

    if (result.success) {
      expect(result.data).not.toHaveProperty("apiKey")
    }
  })

  it("does not reject malformed apiKey values because apiKey is not part of auth contract", () => {
    const malformedBodies = [
      { ...baseBody, apiKey: "invalid-key-format" },
      { ...baseBody, apiKey: "sk-ant-abc\nnewline" },
      { ...baseBody, apiKey: null },
      { ...baseBody, apiKey: { nested: "object" } },
    ]

    for (const body of malformedBodies) {
      const result = BodySchema.safeParse(body)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).not.toHaveProperty("apiKey")
      }
    }
  })
})
