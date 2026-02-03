import { describe, expect, it } from "vitest"
import { generateStorageKey, parseStorageKey } from "../core/keys.js"

describe("Storage Keys", () => {
  describe("generateStorageKey", () => {
    it("should generate keys in correct format", () => {
      const key = generateStorageKey("tenant123", "hash456", "orig")

      expect(key).toBe("t/tenant123/o/hash456/v/orig.webp")
    })

    it("should handle different variants", () => {
      const variants = ["orig", "w640", "w1280", "thumb"] as const

      variants.forEach(variant => {
        const key = generateStorageKey("tenant", "hash", variant)
        expect(key).toContain(`/v/${variant}.webp`)
      })
    })

    it("should maintain tenant isolation in path", () => {
      const key1 = generateStorageKey("tenant1", "hash", "orig")
      const key2 = generateStorageKey("tenant2", "hash", "orig")

      expect(key1).toContain("t/tenant1/")
      expect(key2).toContain("t/tenant2/")
      expect(key1).not.toBe(key2)
    })
  })

  describe("parseStorageKey", () => {
    it("should parse valid keys", () => {
      const key = "t/tenant123/o/hash456/v/orig.webp"
      const parsed = parseStorageKey(key)

      expect(parsed).toEqual({
        tenantId: "tenant123",
        contentHash: "hash456",
        variant: "orig",
      })
    })

    it("should parse keys with UUIDs", () => {
      const key = "t/550e8400-e29b-41d4-a716-446655440000/o/7a3f2b1c4d5e6f7g/v/w640.webp"
      const parsed = parseStorageKey(key)

      expect(parsed).toEqual({
        tenantId: "550e8400-e29b-41d4-a716-446655440000",
        contentHash: "7a3f2b1c4d5e6f7g",
        variant: "w640",
      })
    })

    it("should return null for invalid keys", () => {
      expect(parseStorageKey("invalid/key")).toBeNull()
      expect(parseStorageKey("t/tenant/invalid")).toBeNull()
      expect(parseStorageKey("wrong/format/completely")).toBeNull()
    })

    it("should return null for keys without .webp extension", () => {
      expect(parseStorageKey("t/tenant/o/hash/v/orig.jpg")).toBeNull()
      expect(parseStorageKey("t/tenant/o/hash/v/orig")).toBeNull()
    })

    it("should round-trip correctly", () => {
      const original = {
        tenantId: "tenant123",
        contentHash: "hash456",
        variant: "thumb" as const,
      }

      const key = generateStorageKey(original.tenantId, original.contentHash, original.variant)
      const parsed = parseStorageKey(key)

      expect(parsed).toEqual(original)
    })
  })
})
