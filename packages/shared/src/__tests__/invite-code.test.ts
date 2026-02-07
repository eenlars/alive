import { describe, expect, it } from "vitest"
import { generateInviteCode } from "../invite-code"

describe("generateInviteCode", () => {
  it("returns 10 character string", () => {
    const code = generateInviteCode("user_123")
    expect(code).toHaveLength(10)
  })

  it("is deterministic - same input produces same output", () => {
    const code1 = generateInviteCode("user_123")
    const code2 = generateInviteCode("user_123")
    expect(code1).toBe(code2)
  })

  it("different users get different codes", () => {
    const code1 = generateInviteCode("user_123")
    const code2 = generateInviteCode("user_456")
    expect(code1).not.toBe(code2)
  })

  it("only contains unambiguous characters (no 0, 1, O, I, L)", () => {
    const code = generateInviteCode("user_123")
    // Only A-Z (excluding O, I, L) and 2-9 (excluding 0, 1)
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/)
  })

  it("handles empty string input", () => {
    const code = generateInviteCode("")
    expect(code).toHaveLength(10)
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/)
  })

  it("handles special characters in input", () => {
    const code = generateInviteCode("user@example.com")
    expect(code).toHaveLength(10)
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/)
  })

  it("handles unicode characters in input", () => {
    const code = generateInviteCode("用户_123_🎉")
    expect(code).toHaveLength(10)
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/)
  })

  it("generates unique codes for similar inputs", () => {
    const codes = new Set([
      generateInviteCode("user_1"),
      generateInviteCode("user_2"),
      generateInviteCode("user_3"),
      generateInviteCode("1_user"),
      generateInviteCode("user1"),
      generateInviteCode("User_1"),
    ])
    // All should be unique
    expect(codes.size).toBe(6)
  })

  it("output is always uppercase", () => {
    const code = generateInviteCode("test_user_lowercase")
    expect(code).toBe(code.toUpperCase())
  })
})
