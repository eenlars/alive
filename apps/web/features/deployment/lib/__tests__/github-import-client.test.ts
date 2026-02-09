import { describe, expect, it } from "vitest"
import {
  buildGithubSlugAttempt,
  deriveGithubImportSlug,
  extractGithubRepoName,
  isSupportedGithubRepoInput,
} from "../github-import-client"

describe("extractGithubRepoName", () => {
  it("extracts repo from HTTPS URL", () => {
    expect(extractGithubRepoName("https://github.com/octocat/Hello-World")).toBe("Hello-World")
  })

  it("extracts repo from shorthand format", () => {
    expect(extractGithubRepoName("octocat/Hello-World")).toBe("Hello-World")
  })

  it("extracts repo from SSH URL", () => {
    expect(extractGithubRepoName("git@github.com:octocat/Hello-World.git")).toBe("Hello-World")
  })

  it("extracts repo from URL with extra path segments", () => {
    expect(extractGithubRepoName("https://github.com/octocat/Hello-World/tree/main")).toBe("Hello-World")
  })

  it("returns null for unsupported host", () => {
    expect(extractGithubRepoName("https://gitlab.com/octocat/Hello-World")).toBeNull()
  })
})

describe("isSupportedGithubRepoInput", () => {
  it("returns true for valid GitHub input", () => {
    expect(isSupportedGithubRepoInput("github.com/octocat/Hello-World")).toBe(true)
  })

  it("returns false for invalid input", () => {
    expect(isSupportedGithubRepoInput("not a repo")).toBe(false)
  })
})

describe("deriveGithubImportSlug", () => {
  it("derives a normalized slug from repo URL", () => {
    expect(deriveGithubImportSlug("https://github.com/octocat/Hello-World")).toBe("hello-world")
  })

  it("handles repo names with dots", () => {
    expect(deriveGithubImportSlug("https://github.com/org/repo.js")).toBe("repo-js")
  })

  it("falls back for invalid input", () => {
    expect(deriveGithubImportSlug("")).toBe("github-site")
  })

  it("keeps slug length within 20 chars", () => {
    expect(deriveGithubImportSlug("https://github.com/org/very-long-repository-name-for-testing")).toBe(
      "very-long-repository",
    )
  })
})

describe("buildGithubSlugAttempt", () => {
  it("returns base slug for first attempt", () => {
    expect(buildGithubSlugAttempt("hello-world", 1)).toBe("hello-world")
  })

  it("adds numeric suffix for later attempts", () => {
    expect(buildGithubSlugAttempt("hello-world", 2)).toBe("hello-world-2")
  })

  it("trims base when suffix would exceed max length", () => {
    expect(buildGithubSlugAttempt("abcdefghijklmnopqrst", 12)).toBe("abcdefghijklmnopq-12")
  })
})
