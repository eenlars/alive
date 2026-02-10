/**
 * @vitest-environment node
 *
 * Integration Tests for GitHub Repository Import
 *
 * Tests the full download + prepare flow using a real public GitHub repository.
 * Does NOT test full deployment (that requires systemd).
 *
 * Requires GITHUB_TOKEN env var to be set (GitHub API requires authentication).
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { afterAll, describe, expect, test } from "vitest"
import { cleanupImportDir, importGithubRepo, parseGithubRepo } from "@/lib/deployment/github-import"

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ""
const skipNoToken = !GITHUB_TOKEN ? test.skip : test

/**
 * Track cleanup dirs for afterAll
 */
const cleanupDirs: string[] = []

afterAll(() => {
  for (const dir of cleanupDirs) {
    try {
      cleanupImportDir(dir)
    } catch {
      // Ignore cleanup errors in afterAll
    }
  }
})

describe("GitHub Import Integration", () => {
  describe("import a real public repo (octocat/Hello-World)", () => {
    let templatePath: string
    let cleanupDir: string

    skipNoToken(
      "downloads and prepares a public GitHub repo",
      async () => {
        const result = await importGithubRepo("octocat/Hello-World", GITHUB_TOKEN)
        templatePath = result.templatePath
        cleanupDir = result.cleanupDir
        cleanupDirs.push(cleanupDir)

        expect(templatePath).toBeTruthy()
        expect(cleanupDir).toBeTruthy()
        expect(existsSync(templatePath)).toBe(true)
      },
      30_000,
    )

    skipNoToken("template has user/ directory with repo contents", () => {
      const userDir = join(templatePath, "user")
      expect(existsSync(userDir)).toBe(true)

      // octocat/Hello-World has a README file
      const files = readdirSync(userDir)
      expect(files.length).toBeGreaterThan(0)
      expect(files).toContain("README")
    })

    skipNoToken("template has scripts/ directory", () => {
      const scriptsDir = join(templatePath, "scripts")
      expect(existsSync(scriptsDir)).toBe(true)
      expect(statSync(scriptsDir).isDirectory()).toBe(true)
    })

    skipNoToken(".git directory is removed from user/", () => {
      const gitDir = join(templatePath, "user", ".git")
      expect(existsSync(gitDir)).toBe(false)
    })

    skipNoToken("no root package.json (Hello-World has no package.json)", () => {
      // octocat/Hello-World is a simple repo with just a README, no package.json
      const rootPkg = join(templatePath, "package.json")
      expect(existsSync(rootPkg)).toBe(false)
    })

    skipNoToken("cleanup removes the entire temp directory", () => {
      // After cleanup, the temp dir should be gone
      cleanupImportDir(cleanupDir)

      expect(existsSync(cleanupDir)).toBe(false)

      // Remove from afterAll tracking since we already cleaned up
      const idx = cleanupDirs.indexOf(cleanupDir)
      if (idx !== -1) cleanupDirs.splice(idx, 1)
    })
  })

  describe("import a repo with package.json", () => {
    let templatePath: string
    let cleanupDir: string

    skipNoToken(
      "downloads and prepares a repo that has package.json",
      async () => {
        const result = await importGithubRepo("https://github.com/vitejs/vite-plugin-react.git", GITHUB_TOKEN)
        templatePath = result.templatePath
        cleanupDir = result.cleanupDir
        cleanupDirs.push(cleanupDir)

        expect(existsSync(templatePath)).toBe(true)
      },
      30_000,
    )

    skipNoToken("creates root package.json with workspace config", () => {
      const rootPkgPath = join(templatePath, "package.json")
      expect(existsSync(rootPkgPath)).toBe(true)

      const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf-8"))
      expect(rootPkg.name).toBe("@webalive/imported-site")
      expect(rootPkg.private).toBe(true)
      expect(rootPkg.workspaces).toEqual(["user"])
    })

    skipNoToken("user/ directory contains original package.json", () => {
      const userPkgPath = join(templatePath, "user", "package.json")
      expect(existsSync(userPkgPath)).toBe(true)

      const userPkg = JSON.parse(readFileSync(userPkgPath, "utf-8"))
      expect(userPkg.name).toBeTruthy()
    })
  })

  describe("URL parsing in full flow", () => {
    test("shorthand owner/repo works in parseGithubRepo", () => {
      const parsed = parseGithubRepo("octocat/Hello-World")
      expect(parsed).toEqual({ owner: "octocat", repo: "Hello-World" })
    })

    test("HTTPS URL works in parseGithubRepo", () => {
      const parsed = parseGithubRepo("https://github.com/octocat/Hello-World")
      expect(parsed).toEqual({ owner: "octocat", repo: "Hello-World" })
    })

    test("HTTPS URL with .git suffix works", () => {
      const parsed = parseGithubRepo("https://github.com/octocat/Hello-World.git")
      expect(parsed).toEqual({ owner: "octocat", repo: "Hello-World" })
    })
  })

  describe("error cases", () => {
    skipNoToken("fails on non-existent repo", async () => {
      await expect(
        importGithubRepo("octocat/this-repo-definitely-does-not-exist-abc123xyz", GITHUB_TOKEN),
      ).rejects.toThrow("not found")
    })

    test("invalid URL format throws before downloading", async () => {
      await expect(importGithubRepo("not-a-valid-format", "fake-token")).rejects.toThrow("Invalid GitHub repo format")
    })
  })
})
