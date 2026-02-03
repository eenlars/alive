import { describe, expect, it } from "vitest"
import { generateRequestId, truncateDeep } from "@/lib/utils"

describe("Utility Functions", () => {
  describe("generateRequestId", () => {
    it("should generate a non-empty string", () => {
      const id = generateRequestId()
      expect(id).toBeTruthy()
      expect(typeof id).toBe("string")
      expect(id.length).toBeGreaterThan(0)
    })

    it("should generate unique IDs", () => {
      const ids = new Set<string>()
      const iterations = 10000

      for (let i = 0; i < iterations; i++) {
        ids.add(generateRequestId())
      }

      // All IDs should be unique
      expect(ids.size).toBe(iterations)
    })

    it("should generate IDs quickly", () => {
      const start = Date.now()
      const iterations = 10000

      for (let i = 0; i < iterations; i++) {
        generateRequestId()
      }

      const duration = Date.now() - start
      const perCall = duration / iterations

      // Should be reasonably fast (< 0.1ms per call)
      // Note: Using a generous threshold to avoid flaky tests on loaded systems
      expect(perCall).toBeLessThan(0.1)
    })

    it("should generate IDs without special characters that break logs", () => {
      const id = generateRequestId()

      // Should not contain characters that break log parsing
      expect(id).not.toMatch(/[\n\r\t\0]/)
      expect(id).not.toMatch(/[<>]/) // No HTML/XML chars
    })

    it("should be safe for use in URLs and file paths", () => {
      const id = generateRequestId()

      // Should not contain URL-unsafe characters
      expect(id).not.toMatch(/[^a-zA-Z0-9_-]/)
    })

    it("should have consistent format", () => {
      const ids = Array.from({ length: 100 }, () => generateRequestId())

      // All IDs should have similar characteristics
      const lengths = ids.map(id => id.length)
      const uniqueLengths = new Set(lengths)

      // Length should be consistent (within reason)
      expect(uniqueLengths.size).toBeLessThanOrEqual(3)
    })

    it("should generate different IDs in rapid succession", () => {
      // Even when called microseconds apart
      const id1 = generateRequestId()
      const id2 = generateRequestId()
      const id3 = generateRequestId()

      expect(id1).not.toBe(id2)
      expect(id2).not.toBe(id3)
      expect(id1).not.toBe(id3)
    })

    it("should not be predictable", () => {
      const ids = Array.from({ length: 100 }, () => generateRequestId())

      // IDs should be unique (not sequential or predictable)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(ids.length)

      // Each ID should be a valid format (UUID or timestamp-random)
      for (const id of ids) {
        // Either UUID format (8-4-4-4-12) or legacy format (timestamp-random)
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
        const isLegacy = /^[0-9a-z]+-[0-9a-z]+$/i.test(id)
        expect(isUuid || isLegacy).toBe(true)
      }
    })

    it("should work in concurrent scenarios", async () => {
      // Simulate concurrent request ID generation
      const promises = Array.from({ length: 1000 }, () => Promise.resolve().then(() => generateRequestId()))

      const ids = await Promise.all(promises)
      const uniqueIds = new Set(ids)

      expect(uniqueIds.size).toBe(ids.length)
    })

    it("should handle high-frequency generation", () => {
      const _idsPerSecond = 100000
      const duration = 100 // ms

      const start = Date.now()
      const ids = new Set<string>()

      while (Date.now() - start < duration) {
        ids.add(generateRequestId())
      }

      // Should generate many IDs without collision
      expect(ids.size).toBeGreaterThan(1000)

      // All should be unique
      const idsArray = Array.from(ids)
      expect(new Set(idsArray).size).toBe(idsArray.length)
    })

    it("should not overflow or throw errors", () => {
      // Generate many IDs to check for overflow issues
      expect(() => {
        for (let i = 0; i < 100000; i++) {
          generateRequestId()
        }
      }).not.toThrow()
    })

    it("should be suitable for log correlation", () => {
      const id = generateRequestId()

      // Should be easy to search in logs
      expect(id).toMatch(/^[a-z0-9-_]+$/i)

      // Should be reasonably short for readability
      expect(id.length).toBeLessThan(100)
      expect(id.length).toBeGreaterThan(5)
    })

    it("should not contain sensitive information", () => {
      const id = generateRequestId()

      // Should not reveal:
      // - User information
      // - Workspace paths
      // - Timestamps that could be used for timing attacks
      // - Sequential patterns

      expect(id).not.toMatch(/user|workspace|password|key|secret/i)
      expect(id).not.toMatch(/\/|\\/) // No file paths
    })
  })

  describe("truncateDeep", () => {
    it("truncates long strings", () => {
      const input = "a".repeat(300)
      const result = truncateDeep(input, 200)
      expect(result).toBe(`${"a".repeat(200)}...[truncated 100 chars]`)
    })

    it("preserves short strings", () => {
      const input = "hello world"
      const result = truncateDeep(input, 200)
      expect(result).toBe("hello world")
    })

    it("handles primitives", () => {
      expect(truncateDeep(123)).toBe(123)
      expect(truncateDeep(true)).toBe(true)
      expect(truncateDeep(null)).toBe(null)
      expect(truncateDeep(undefined)).toBe(undefined)
    })

    it("handles special types", () => {
      expect(truncateDeep(123n)).toBe("123n")
      expect(truncateDeep(Symbol("test"))).toBe("Symbol(test)")
      expect(truncateDeep(() => {})).toMatch(/\[Function/)
      expect(truncateDeep(new Date("2025-01-01"))).toBe("2025-01-01T00:00:00.000Z")
      expect(truncateDeep(/test/gi)).toBe("/test/gi")
    })

    it("handles Error objects", () => {
      const error = new Error("Test error")
      const result = truncateDeep(error) as any
      expect(result.name).toBe("Error")
      expect(result.message).toBe("Test error")
      expect(result.stack).toBeDefined()
    })

    it("handles nested objects", () => {
      const input = {
        level1: {
          level2: {
            level3: {
              message: "a".repeat(300),
            },
          },
        },
      }
      const result = truncateDeep(input, 200) as any
      expect(result.level1.level2.level3.message).toBe(`${"a".repeat(200)}...[truncated 100 chars]`)
    })

    it("handles arrays", () => {
      const input = ["short", "a".repeat(300), { message: "b".repeat(300) }]
      const result = truncateDeep(input, 200) as any
      expect(result[0]).toBe("short")
      expect(result[1]).toBe(`${"a".repeat(200)}...[truncated 100 chars]`)
      expect(result[2].message).toBe(`${"b".repeat(200)}...[truncated 100 chars]`)
    })

    it("handles circular references", () => {
      const obj: any = { name: "test" }
      obj.self = obj // circular reference
      const result = truncateDeep(obj) as any
      expect(result.name).toBe("test")
      expect(result.self).toBe("[Circular Reference]")
    })

    it("handles array circular references", () => {
      const arr: any[] = [1, 2, 3]
      arr.push(arr) // circular reference
      const result = truncateDeep(arr) as any
      expect(result[0]).toBe(1)
      expect(result[1]).toBe(2)
      expect(result[2]).toBe(3)
      expect(result[3]).toBe("[Circular Reference]")
    })

    it("handles max depth", () => {
      const deep = { a: { b: { c: { d: { e: { f: "too deep" } } } } } }
      const result = truncateDeep(deep, 200, 3) as any
      expect(result.a.b.c).toBe("[max depth reached]")
    })

    it("handles objects with getters that throw", () => {
      const obj = {
        good: "value",
        get bad() {
          throw new Error("Getter error")
        },
      }
      const result = truncateDeep(obj) as any
      expect(result.good).toBe("value")
      expect(result.bad).toMatch(/Error accessing property/)
    })

    it("handles malformed objects", () => {
      const obj = Object.create(null)
      obj.name = "test"
      const result = truncateDeep(obj) as any
      expect(result.name).toBe("test")
    })

    it("handles mixed nested structures", () => {
      const input = {
        users: [
          {
            name: "Alice",
            bio: "a".repeat(300),
            createdAt: new Date("2025-01-01"),
          },
          {
            name: "Bob",
            regex: /test/i,
            error: new Error("Something failed"),
          },
        ],
        metadata: {
          version: 1,
          bigNumber: 999999999999999999n,
        },
      }

      const result = truncateDeep(input, 200) as any
      expect(result.users[0].name).toBe("Alice")
      expect(result.users[0].bio).toBe(`${"a".repeat(200)}...[truncated 100 chars]`)
      expect(result.users[0].createdAt).toBe("2025-01-01T00:00:00.000Z")
      expect(result.users[1].regex).toBe("/test/i")
      expect(result.users[1].error.name).toBe("Error")
      expect(result.metadata.bigNumber).toBe("999999999999999999n")
    })

    it("prevents stack overflow with extremely deep nesting", () => {
      let deep: any = { value: "leaf" }
      for (let i = 0; i < 100; i++) {
        deep = { child: deep }
      }

      // Should not crash, max depth should protect us
      const result = truncateDeep(deep, 200, 50)
      expect(result).toBeDefined()
    })

    it("handles empty structures", () => {
      expect(truncateDeep({})).toEqual({})
      expect(truncateDeep([])).toEqual([])
    })

    it("handles objects with null prototype", () => {
      const obj = Object.create(null)
      obj.key = "value"
      const result = truncateDeep(obj) as any
      expect(result.key).toBe("value")
    })
  })
})
