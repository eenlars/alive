/**
 * @vitest-environment node
 *
 * Unit Tests for GitHub Import
 *
 * Tests URL parsing, template preparation, auth URL construction,
 * and cleanup logic for github-import.ts
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { afterAll, beforeEach, describe, expect, test } from "vitest"
import { cleanupImportDir, parseGithubRepo, prepareImportedRepo } from "../github-import"

/**
 * Track all temp dirs created during tests for cleanup in afterAll.
 */
const tempDirsToCleanup: string[] = []

function createTempImportDir(): string {
  const dir = `/tmp/github-import-test-${crypto.randomUUID()}`
  mkdirSync(dir, { recursive: true })
  tempDirsToCleanup.push(dir)
  return dir
}

afterAll(() => {
  for (const dir of tempDirsToCleanup) {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe("parseGithubRepo", () => {
  describe("HTTPS URL format", () => {
    test("parses standard GitHub HTTPS URL", () => {
      const result = parseGithubRepo("https://github.com/octocat/Hello-World")
      expect(result).toEqual({ owner: "octocat", repo: "Hello-World" })
    })

    test("parses HTTPS URL with .git suffix", () => {
      const result = parseGithubRepo("https://github.com/octocat/Hello-World.git")
      expect(result).toEqual({ owner: "octocat", repo: "Hello-World" })
    })

    test("parses URL with hyphens in owner/repo", () => {
      const result = parseGithubRepo("https://github.com/my-org/my-project")
      expect(result).toEqual({ owner: "my-org", repo: "my-project" })
    })

    test("rejects URL with dots in repo name (ambiguous with .git suffix)", () => {
      // The HTTPS regex uses [^/.] so dots in repo names are not supported via URL
      // Use owner/repo shorthand instead for repos with dots
      expect(() => parseGithubRepo("https://github.com/my-org/my.project")).toThrow("Invalid GitHub repo format")
    })

    test("parses URL with underscores in owner/repo", () => {
      const result = parseGithubRepo("https://github.com/my_org/my_project")
      expect(result).toEqual({ owner: "my_org", repo: "my_project" })
    })

    test("parses URL with numeric owner/repo", () => {
      const result = parseGithubRepo("https://github.com/user123/repo456")
      expect(result).toEqual({ owner: "user123", repo: "repo456" })
    })
  })

  describe("owner/repo shorthand", () => {
    test("parses simple owner/repo", () => {
      const result = parseGithubRepo("octocat/Hello-World")
      expect(result).toEqual({ owner: "octocat", repo: "Hello-World" })
    })

    test("parses shorthand with dots", () => {
      const result = parseGithubRepo("owner/repo.js")
      expect(result).toEqual({ owner: "owner", repo: "repo.js" })
    })

    test("parses shorthand with hyphens and underscores", () => {
      const result = parseGithubRepo("my-org/my_repo")
      expect(result).toEqual({ owner: "my-org", repo: "my_repo" })
    })
  })

  describe("invalid formats", () => {
    test("throws on plain string without slash", () => {
      expect(() => parseGithubRepo("just-a-repo")).toThrow("Invalid GitHub repo format")
    })

    test("throws on HTTP (non-HTTPS) URL", () => {
      expect(() => parseGithubRepo("http://github.com/owner/repo")).toThrow("Invalid GitHub repo format")
    })

    test("throws on SSH URL format", () => {
      expect(() => parseGithubRepo("git@github.com:owner/repo.git")).toThrow("Invalid GitHub repo format")
    })

    test("throws on URL with trailing path segments", () => {
      expect(() => parseGithubRepo("https://github.com/owner/repo/tree/main")).toThrow("Invalid GitHub repo format")
    })

    test("throws on empty string", () => {
      expect(() => parseGithubRepo("")).toThrow("Invalid GitHub repo format")
    })

    test("throws on URL with different host", () => {
      expect(() => parseGithubRepo("https://gitlab.com/owner/repo")).toThrow("Invalid GitHub repo format")
    })

    test("throws on URL without repo name", () => {
      expect(() => parseGithubRepo("https://github.com/owner")).toThrow("Invalid GitHub repo format")
    })
  })
})

describe("prepareImportedRepo", () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = createTempImportDir()
  })

  test("moves cloned dir to user/ directory", () => {
    const repoDir = join(tempDir, "repo")
    mkdirSync(repoDir, { recursive: true })
    writeFileSync(join(repoDir, "index.html"), "<h1>Hello</h1>")

    const templatePath = prepareImportedRepo(repoDir)

    // repo/ should no longer exist
    expect(existsSync(repoDir)).toBe(false)

    // user/ should contain the file
    const userDir = join(templatePath, "user")
    expect(existsSync(userDir)).toBe(true)
    expect(existsSync(join(userDir, "index.html"))).toBe(true)
    expect(readFileSync(join(userDir, "index.html"), "utf-8")).toBe("<h1>Hello</h1>")
  })

  test("removes .git directory from user/", () => {
    const repoDir = join(tempDir, "repo")
    mkdirSync(repoDir, { recursive: true })
    mkdirSync(join(repoDir, ".git"), { recursive: true })
    writeFileSync(join(repoDir, ".git", "HEAD"), "ref: refs/heads/main")
    writeFileSync(join(repoDir, "README.md"), "# Test")

    prepareImportedRepo(repoDir)

    const userDir = join(tempDir, "user")
    expect(existsSync(join(userDir, ".git"))).toBe(false)
    expect(existsSync(join(userDir, "README.md"))).toBe(true)
  })

  test("creates root package.json when user/package.json exists", () => {
    const repoDir = join(tempDir, "repo")
    mkdirSync(repoDir, { recursive: true })
    writeFileSync(join(repoDir, "package.json"), JSON.stringify({ name: "my-app", version: "1.0.0" }))

    const templatePath = prepareImportedRepo(repoDir)

    const rootPkg = JSON.parse(readFileSync(join(templatePath, "package.json"), "utf-8"))
    expect(rootPkg.name).toBe("@webalive/imported-site")
    expect(rootPkg.private).toBe(true)
    expect(rootPkg.workspaces).toEqual(["user"])
    expect(rootPkg.scripts.dev).toBe("cd user && bun run dev")
    expect(rootPkg.scripts.build).toBe("cd user && bun run build")
    expect(rootPkg.scripts.preview).toBe("cd user && bun run preview")
  })

  test("does NOT create root package.json when user has no package.json", () => {
    const repoDir = join(tempDir, "repo")
    mkdirSync(repoDir, { recursive: true })
    writeFileSync(join(repoDir, "index.html"), "<h1>Static site</h1>")

    const templatePath = prepareImportedRepo(repoDir)

    expect(existsSync(join(templatePath, "package.json"))).toBe(false)
  })

  test("creates empty scripts/ directory", () => {
    const repoDir = join(tempDir, "repo")
    mkdirSync(repoDir, { recursive: true })
    writeFileSync(join(repoDir, "index.html"), "test")

    const templatePath = prepareImportedRepo(repoDir)

    const scriptsDir = join(templatePath, "scripts")
    expect(existsSync(scriptsDir)).toBe(true)
  })

  test("returns the template directory (parent of cloned dir)", () => {
    const repoDir = join(tempDir, "repo")
    mkdirSync(repoDir, { recursive: true })
    writeFileSync(join(repoDir, "index.html"), "test")

    const templatePath = prepareImportedRepo(repoDir)

    expect(resolve(templatePath)).toBe(resolve(tempDir))
  })

  test("preserves nested directory structure", () => {
    const repoDir = join(tempDir, "repo")
    mkdirSync(join(repoDir, "src", "components"), { recursive: true })
    writeFileSync(join(repoDir, "src", "components", "App.tsx"), "export default function App() {}")
    writeFileSync(join(repoDir, "package.json"), JSON.stringify({ name: "test" }))

    prepareImportedRepo(repoDir)

    const userDir = join(tempDir, "user")
    expect(existsSync(join(userDir, "src", "components", "App.tsx"))).toBe(true)
    expect(readFileSync(join(userDir, "src", "components", "App.tsx"), "utf-8")).toBe(
      "export default function App() {}",
    )
  })
})

describe("cleanupImportDir", () => {
  test("removes a valid import directory", () => {
    const importDir = `/tmp/github-import-${crypto.randomUUID()}`
    mkdirSync(importDir, { recursive: true })
    writeFileSync(join(importDir, "test.txt"), "data")
    tempDirsToCleanup.push(importDir)

    cleanupImportDir(importDir)

    expect(existsSync(importDir)).toBe(false)
  })

  test("throws when trying to remove a directory outside the import prefix", () => {
    expect(() => cleanupImportDir("/tmp/not-an-import-dir")).toThrow(
      "Refusing to remove directory outside of import prefix",
    )
  })

  test("throws for /tmp path without import prefix", () => {
    expect(() => cleanupImportDir("/tmp/some-random-dir")).toThrow(
      "Refusing to remove directory outside of import prefix",
    )
  })

  test("throws for dangerous paths", () => {
    expect(() => cleanupImportDir("/")).toThrow("Refusing to remove directory outside of import prefix")
    expect(() => cleanupImportDir("/home")).toThrow("Refusing to remove directory outside of import prefix")
    expect(() => cleanupImportDir("/root")).toThrow("Refusing to remove directory outside of import prefix")
  })

  test("does not throw when directory does not exist (already cleaned up)", () => {
    const nonExistent = `/tmp/github-import-${crypto.randomUUID()}`
    // Should not throw - just a no-op
    expect(() => cleanupImportDir(nonExistent)).not.toThrow()
  })

  test("removes nested contents recursively", () => {
    const importDir = `/tmp/github-import-${crypto.randomUUID()}`
    mkdirSync(join(importDir, "user", "src"), { recursive: true })
    writeFileSync(join(importDir, "user", "src", "index.ts"), "console.log('hi')")
    writeFileSync(join(importDir, "package.json"), "{}")
    tempDirsToCleanup.push(importDir)

    cleanupImportDir(importDir)

    expect(existsSync(importDir)).toBe(false)
  })
})
