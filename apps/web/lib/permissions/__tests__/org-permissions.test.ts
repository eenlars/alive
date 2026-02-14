import { describe, expect, it } from "vitest"
import { canInviteMembers, canRemoveMember, canUpdateOrganization } from "../org-permissions"

describe("org-permissions", () => {
  describe("canRemoveMember", () => {
    it("allows self-leave for all roles", () => {
      expect(canRemoveMember("owner", "owner", true)).toBe(true)
      expect(canRemoveMember("admin", "admin", true)).toBe(true)
      expect(canRemoveMember("member", "member", true)).toBe(true)
    })

    it("disallows self-leave without a role", () => {
      expect(canRemoveMember(null, "member", true)).toBe(false)
      expect(canRemoveMember(undefined, "member", true)).toBe(false)
    })

    it("allows owner to remove admin/member", () => {
      expect(canRemoveMember("owner", "admin", false)).toBe(true)
      expect(canRemoveMember("owner", "member", false)).toBe(true)
    })

    it("allows admin to remove member only", () => {
      expect(canRemoveMember("admin", "member", false)).toBe(true)
      expect(canRemoveMember("admin", "admin", false)).toBe(false)
      expect(canRemoveMember("admin", "owner", false)).toBe(false)
    })

    it("disallows member and missing role", () => {
      expect(canRemoveMember("member", "member", false)).toBe(false)
      expect(canRemoveMember(null, "member", false)).toBe(false)
      expect(canRemoveMember(undefined, "member", false)).toBe(false)
    })
  })

  describe("admin-level permissions", () => {
    it("only owner/admin can update organizations", () => {
      expect(canUpdateOrganization("owner")).toBe(true)
      expect(canUpdateOrganization("admin")).toBe(true)
      expect(canUpdateOrganization("member")).toBe(false)
      expect(canUpdateOrganization(null)).toBe(false)
    })

    it("only owner/admin can invite members", () => {
      expect(canInviteMembers("owner")).toBe(true)
      expect(canInviteMembers("admin")).toBe(true)
      expect(canInviteMembers("member")).toBe(false)
      expect(canInviteMembers(null)).toBe(false)
    })
  })
})
