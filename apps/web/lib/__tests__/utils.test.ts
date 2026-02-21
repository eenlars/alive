import { describe, expect, it } from "vitest"
import { truncateDeep } from "@/lib/utils"

describe("Utility Functions", () => {
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
