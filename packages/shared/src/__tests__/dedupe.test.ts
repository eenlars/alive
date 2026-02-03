import { describe, it, expect } from "vitest"
import { createDedupeCache, createPrefixedDedupeCache } from "../dedupe"

describe("dedupe utilities", () => {
  describe("createDedupeCache", () => {
    it("should return false for new keys", () => {
      const cache = createDedupeCache({ ttlMs: 1000, maxSize: 100 })
      expect(cache.check("key1")).toBe(false)
      expect(cache.check("key2")).toBe(false)
    })

    it("should return true for duplicate keys within TTL", () => {
      const cache = createDedupeCache({ ttlMs: 1000, maxSize: 100 })

      expect(cache.check("key1")).toBe(false) // First time
      expect(cache.check("key1")).toBe(true) // Duplicate
      expect(cache.check("key1")).toBe(true) // Still duplicate
    })

    it("should return false for null/undefined keys", () => {
      const cache = createDedupeCache({ ttlMs: 1000, maxSize: 100 })

      expect(cache.check(null)).toBe(false)
      expect(cache.check(undefined)).toBe(false)
    })

    it("should expire keys after TTL", () => {
      const cache = createDedupeCache({ ttlMs: 100, maxSize: 100 })
      const now = 1000

      expect(cache.check("key1", now)).toBe(false) // Add at t=1000
      expect(cache.check("key1", now + 50)).toBe(true) // Still valid at t=1050
      expect(cache.check("key1", now + 150)).toBe(false) // Expired at t=1150
    })

    it("should enforce max size by removing oldest entries", () => {
      const cache = createDedupeCache({ ttlMs: 10000, maxSize: 3 })

      cache.check("key1")
      cache.check("key2")
      cache.check("key3")
      expect(cache.size()).toBe(3)

      cache.check("key4") // Should evict key1
      expect(cache.size()).toBe(3)
      expect(cache.has("key1")).toBe(false)
      expect(cache.has("key2")).toBe(true)
      expect(cache.has("key4")).toBe(true)
    })

    it("should refresh key position on access", () => {
      const cache = createDedupeCache({ ttlMs: 10000, maxSize: 3 })

      cache.check("key1")
      cache.check("key2")
      cache.check("key3")

      // Access key1 to refresh it
      cache.check("key1")

      // Now add key4 - should evict key2 (oldest after key1 was refreshed)
      cache.check("key4")

      expect(cache.has("key1")).toBe(true)
      expect(cache.has("key2")).toBe(false)
      expect(cache.has("key3")).toBe(true)
      expect(cache.has("key4")).toBe(true)
    })

    it("should clear all entries", () => {
      const cache = createDedupeCache({ ttlMs: 1000, maxSize: 100 })

      cache.check("key1")
      cache.check("key2")
      expect(cache.size()).toBe(2)

      cache.clear()
      expect(cache.size()).toBe(0)
      expect(cache.check("key1")).toBe(false) // No longer a duplicate
    })

    it("should return all keys", () => {
      const cache = createDedupeCache({ ttlMs: 1000, maxSize: 100 })

      cache.check("key1")
      cache.check("key2")
      cache.check("key3")

      const keys = cache.keys()
      expect(keys).toContain("key1")
      expect(keys).toContain("key2")
      expect(keys).toContain("key3")
      expect(keys.length).toBe(3)
    })

    it("should delete specific keys", () => {
      const cache = createDedupeCache({ ttlMs: 1000, maxSize: 100 })

      cache.check("key1")
      cache.check("key2")

      expect(cache.delete("key1")).toBe(true)
      expect(cache.has("key1")).toBe(false)
      expect(cache.has("key2")).toBe(true)

      expect(cache.delete("nonexistent")).toBe(false)
    })

    it("should handle has() with expiry check", async () => {
      // Use a very short TTL for testing
      const cache = createDedupeCache({ ttlMs: 20, maxSize: 100 })

      cache.check("key1")
      expect(cache.has("key1")).toBe(true)

      // Wait for TTL to expire
      await new Promise(r => setTimeout(r, 30))

      expect(cache.has("key1")).toBe(false)
    })

    it("should handle zero maxSize", () => {
      const cache = createDedupeCache({ ttlMs: 1000, maxSize: 0 })

      expect(cache.check("key1")).toBe(false)
      expect(cache.size()).toBe(0) // Should be cleared immediately
    })
  })

  describe("createPrefixedDedupeCache", () => {
    it("should isolate keys by prefix", () => {
      const cache = createPrefixedDedupeCache({ ttlMs: 1000, maxSize: 100 })

      expect(cache.check("user1", "action1")).toBe(false)
      expect(cache.check("user2", "action1")).toBe(false) // Different prefix

      expect(cache.check("user1", "action1")).toBe(true) // Same prefix and key
      expect(cache.check("user2", "action1")).toBe(true) // Same prefix and key
    })

    it("should track size per prefix", () => {
      const cache = createPrefixedDedupeCache({ ttlMs: 1000, maxSize: 100 })

      cache.check("user1", "a")
      cache.check("user1", "b")
      cache.check("user2", "x")

      expect(cache.size("user1")).toBe(2)
      expect(cache.size("user2")).toBe(1)
      expect(cache.size()).toBe(3) // Total
    })

    it("should clear by prefix", () => {
      const cache = createPrefixedDedupeCache({ ttlMs: 1000, maxSize: 100 })

      cache.check("user1", "a")
      cache.check("user1", "b")
      cache.check("user2", "x")

      cache.clear("user1")

      expect(cache.size("user1")).toBe(0)
      expect(cache.size("user2")).toBe(1)
    })

    it("should clear all prefixes", () => {
      const cache = createPrefixedDedupeCache({ ttlMs: 1000, maxSize: 100 })

      cache.check("user1", "a")
      cache.check("user2", "x")

      cache.clear()

      expect(cache.size()).toBe(0)
    })

    it("should enforce maxSize per prefix", () => {
      const cache = createPrefixedDedupeCache({ ttlMs: 10000, maxSize: 2 })

      cache.check("user1", "a")
      cache.check("user1", "b")
      cache.check("user1", "c") // Should evict 'a'

      expect(cache.size("user1")).toBe(2)
    })
  })

  describe("real-world scenarios", () => {
    it("should prevent duplicate webhook processing", () => {
      const cache = createDedupeCache({ ttlMs: 60_000, maxSize: 1000 })
      const processedWebhooks: string[] = []

      function handleWebhook(id: string) {
        if (cache.check(id)) {
          return // Duplicate
        }
        processedWebhooks.push(id)
      }

      handleWebhook("webhook-123")
      handleWebhook("webhook-456")
      handleWebhook("webhook-123") // Duplicate
      handleWebhook("webhook-789")
      handleWebhook("webhook-456") // Duplicate

      expect(processedWebhooks).toEqual(["webhook-123", "webhook-456", "webhook-789"])
    })

    it("should implement per-user rate limiting", () => {
      const cache = createPrefixedDedupeCache({ ttlMs: 100, maxSize: 10 })
      const now = 1000

      // User 1 can do action A at t=1000 (first time = false from check)
      expect(cache.check("user1", "action-a", now)).toBe(false)

      // User 1 cannot do action A again at t=1050 (within TTL, duplicate = true)
      expect(cache.check("user1", "action-a", now + 50)).toBe(true)

      // User 1 can do action B at t=1050 (different action = false)
      expect(cache.check("user1", "action-b", now + 50)).toBe(false)

      // User 2 can do action A at t=1050 (different user = false)
      expect(cache.check("user2", "action-a", now + 50)).toBe(false)

      // User 1 can do action A again at t=1200 (after TTL of 100ms from last touch at 1050)
      // Note: last touch was at 1050, so expired at 1150, check at 1200 should be fresh
      expect(cache.check("user1", "action-a", now + 200)).toBe(false)
    })
  })
})
