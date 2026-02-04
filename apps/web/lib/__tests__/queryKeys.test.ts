import { describe, expect, it } from "vitest"
import { QUERY_KEYS } from "@/lib/url/queryState"

describe("QUERY_KEYS", () => {
  it("does not allow duplicate query string keys", () => {
    const values = Object.values(QUERY_KEYS)
    const uniqueValues = new Set(values)

    expect(uniqueValues.size).toBe(values.length)
  })
})
