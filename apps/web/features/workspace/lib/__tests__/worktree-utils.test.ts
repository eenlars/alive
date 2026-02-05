import { describe, expect, it } from "vitest"
import { buildWorkspaceKey, normalizeWorktreeSlug, parseWorkspaceKey, validateWorktreeSlug } from "../worktree-utils"

describe("worktree-utils", () => {
  it("normalizes worktree slugs", () => {
    expect(normalizeWorktreeSlug(" Feature-ONE ")).toBe("feature-one")
  })

  it("validates worktree slugs", () => {
    const valid = validateWorktreeSlug("feature-1")
    expect(valid.valid).toBe(true)
    if (valid.valid) {
      expect(valid.slug).toBe("feature-1")
    }

    const normalized = validateWorktreeSlug(" Feature-2 ")
    expect(normalized.valid).toBe(true)
    if (normalized.valid) {
      expect(normalized.slug).toBe("feature-2")
    }
  })

  it("rejects invalid or reserved worktree slugs", () => {
    const empty = validateWorktreeSlug("  ")
    expect(empty.valid).toBe(false)

    const invalid = validateWorktreeSlug("Bad/Slug")
    expect(invalid.valid).toBe(false)

    const reserved = validateWorktreeSlug("user")
    expect(reserved.valid).toBe(false)

    // Rejects values containing session key delimiter (prevents key corruption)
    const withDelimiter = validateWorktreeSlug("foo::bar")
    expect(withDelimiter.valid).toBe(false)

    // Rejects spaces
    const withSpaces = validateWorktreeSlug("foo bar")
    expect(withSpaces.valid).toBe(false)
  })

  it("builds workspace keys with optional worktree", () => {
    expect(buildWorkspaceKey("example.com", null)).toBe("example.com")
    expect(buildWorkspaceKey("example.com", "feature")).toBe("example.com::wt/feature")
    expect(buildWorkspaceKey("example.com", "Feature-One")).toBe("example.com::wt/feature-one")
  })

  it("parses workspace keys", () => {
    expect(parseWorkspaceKey("example.com")).toEqual({
      workspace: "example.com",
      worktree: null,
    })

    expect(parseWorkspaceKey("example.com::wt/feature")).toEqual({
      workspace: "example.com",
      worktree: "feature",
    })
  })
})
