import { describe, expect, it } from "vitest"

describe("example test", () => {
  it("should pass basic assertion", () => {
    expect(1 + 1).toBe(2)
  })

  it("should work with arrays", () => {
    const arr = [1, 2, 3]
    expect(arr).toHaveLength(3)
    expect(arr).toContain(2)
  })
})
