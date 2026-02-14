import { describe, expect, it } from "vitest"
import {
  buildSessionOrgClaims,
  isOrgAdminRole,
  isOrgRole,
  isOrgRoleWithViewer,
  ORG_ROLES,
  ORG_ROLES_WITH_VIEWER,
} from "../org-roles"

describe("isOrgRole", () => {
  it("accepts valid roles", () => {
    for (const role of ORG_ROLES) {
      expect(isOrgRole(role)).toBe(true)
    }
  })

  it("rejects viewer", () => {
    expect(isOrgRole("viewer")).toBe(false)
  })

  it("rejects non-string values", () => {
    expect(isOrgRole(null)).toBe(false)
    expect(isOrgRole(undefined)).toBe(false)
    expect(isOrgRole(42)).toBe(false)
    expect(isOrgRole({})).toBe(false)
  })

  it("rejects unknown strings", () => {
    expect(isOrgRole("superadmin")).toBe(false)
    expect(isOrgRole("")).toBe(false)
  })
})

describe("isOrgRoleWithViewer", () => {
  it("accepts all standard roles plus viewer", () => {
    for (const role of ORG_ROLES_WITH_VIEWER) {
      expect(isOrgRoleWithViewer(role)).toBe(true)
    }
  })

  it("rejects unknown strings", () => {
    expect(isOrgRoleWithViewer("superadmin")).toBe(false)
    expect(isOrgRoleWithViewer(null)).toBe(false)
  })
})

describe("isOrgAdminRole", () => {
  it("accepts owner and admin", () => {
    expect(isOrgAdminRole("owner")).toBe(true)
    expect(isOrgAdminRole("admin")).toBe(true)
  })

  it("rejects member and viewer", () => {
    expect(isOrgAdminRole("member")).toBe(false)
    expect(isOrgAdminRole("viewer")).toBe(false)
  })

  it("rejects non-string values", () => {
    expect(isOrgAdminRole(null)).toBe(false)
    expect(isOrgAdminRole(undefined)).toBe(false)
  })
})

describe("buildSessionOrgClaims", () => {
  it("returns empty claims for null/undefined/empty input", () => {
    expect(buildSessionOrgClaims(null)).toEqual({ orgIds: [], orgRoles: {} })
    expect(buildSessionOrgClaims(undefined)).toEqual({ orgIds: [], orgRoles: {} })
    expect(buildSessionOrgClaims([])).toEqual({ orgIds: [], orgRoles: {} })
  })

  it("builds claims from valid memberships", () => {
    const result = buildSessionOrgClaims([
      { org_id: "org-1", role: "owner" },
      { org_id: "org-2", role: "member" },
    ])

    expect(result.orgIds).toEqual(["org-1", "org-2"])
    expect(result.orgRoles).toEqual({ "org-1": "owner", "org-2": "member" })
  })

  it("skips memberships with null org_id", () => {
    const result = buildSessionOrgClaims([
      { org_id: null, role: "owner" },
      { org_id: "org-1", role: "member" },
    ])

    expect(result.orgIds).toEqual(["org-1"])
    expect(result.orgRoles).toEqual({ "org-1": "member" })
  })

  it("skips memberships with invalid roles", () => {
    const result = buildSessionOrgClaims([
      { org_id: "org-1", role: "owner" },
      { org_id: "org-2", role: "viewer" },
      { org_id: "org-3", role: "superadmin" },
    ])

    expect(result.orgIds).toEqual(["org-1"])
    expect(result.orgRoles).toEqual({ "org-1": "owner" })
  })

  it("deduplicates org IDs", () => {
    const result = buildSessionOrgClaims([
      { org_id: "org-1", role: "owner" },
      { org_id: "org-1", role: "admin" },
    ])

    expect(result.orgIds).toEqual(["org-1"])
    // Last role wins for the same org_id
    expect(result.orgRoles).toEqual({ "org-1": "admin" })
  })
})
