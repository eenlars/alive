import path from "node:path"
import { describe, expect, it } from "vitest"
import { ensurePathWithinWorkspace } from "@/features/workspace/lib/workspace-secure"

describe("Workspace Security - Path Traversal Prevention", () => {
  const workspaceRoot = "/srv/webalive/sites/example.com/user"

  describe("ensurePathWithinWorkspace", () => {
    it("should allow valid paths within workspace", () => {
      const validPaths = [
        path.join(workspaceRoot, "index.ts"),
        path.join(workspaceRoot, "pages/home.tsx"),
        path.join(workspaceRoot, "lib/utils.ts"),
        path.join(workspaceRoot, "styles.css"),
      ]

      for (const validPath of validPaths) {
        expect(() => ensurePathWithinWorkspace(validPath, workspaceRoot)).not.toThrow()
      }
    })

    it("should reject path traversal attacks with ../", () => {
      const attacks = [
        path.join(workspaceRoot, "../../../etc/passwd"),
        path.join(workspaceRoot, "../../root/.ssh/id_rsa"),
        path.join(workspaceRoot, "../.env"),
      ]

      for (const attack of attacks) {
        expect(
          () => ensurePathWithinWorkspace(attack, workspaceRoot),
          `Should block path traversal: ${attack}`,
        ).toThrow(/outside.*workspace/i)
      }
    })

    it("should reject absolute paths outside workspace", () => {
      const attacks = [
        "/etc/passwd",
        "/root/.ssh/id_rsa",
        "/srv/webalive/sites/other-site/secret.txt",
        "/home/user/.bashrc",
      ]

      for (const attack of attacks) {
        expect(() => ensurePathWithinWorkspace(attack, workspaceRoot), `Should block absolute path: ${attack}`).toThrow(
          /outside.*workspace/i,
        )
      }
    })

    it("should handle symbolic link attacks (in path string)", () => {
      // Even if symlinks exist, the path string should be validated
      const symlinkAttacks = [
        path.join(workspaceRoot, "symlink/../../../etc/passwd"),
        path.join(workspaceRoot, "./link/../../secret"),
      ]

      for (const attack of symlinkAttacks) {
        expect(
          () => ensurePathWithinWorkspace(attack, workspaceRoot),
          `Should validate path even with symlinks: ${attack}`,
        ).toThrow(/outside.*workspace/i)
      }
    })

    it("should normalize paths before validation", () => {
      // Paths with redundant separators or ./ should still be validated
      const normalizedAttacks = [
        path.join(workspaceRoot, "./././../../../etc/passwd"),
        path.join(workspaceRoot, "foo/bar/../../../../../../etc/passwd"),
      ]

      for (const attack of normalizedAttacks) {
        expect(() => ensurePathWithinWorkspace(attack, workspaceRoot)).toThrow(/outside.*workspace/i)
      }
    })

    it("should handle URL-encoded characters in paths", () => {
      const encodedPaths = [`${workspaceRoot}/%2e%2e/%2e%2e/etc/passwd`, `${workspaceRoot}/%252e%252e/secret`]

      for (const encodedPath of encodedPaths) {
        expect(() => ensurePathWithinWorkspace(encodedPath, workspaceRoot)).not.toThrow()
      }
    })

    it("should handle workspace root path strictly", () => {
      expect(() => ensurePathWithinWorkspace(workspaceRoot, workspaceRoot)).toThrow(/outside.*workspace/i)
    })

    it("should handle trailing slashes correctly", () => {
      const pathsWithSlashes = [path.join(workspaceRoot, "folder/"), path.join(workspaceRoot, "file.txt/")]

      for (const p of pathsWithSlashes) {
        expect(() => ensurePathWithinWorkspace(p, workspaceRoot)).not.toThrow()
      }
    })

    it("should reject empty or invalid paths", () => {
      const invalidPaths = ["", " ", null, undefined]

      for (const invalid of invalidPaths) {
        expect(() => ensurePathWithinWorkspace(invalid as any, workspaceRoot)).toThrow()
      }
    })
  })

  describe("Real-World Attack Scenarios", () => {
    it("should block attempts to read /etc/passwd", () => {
      const attacks = ["../../../etc/passwd", "../../../../../../etc/passwd", "./../.../etc/passwd"]

      for (const attack of attacks) {
        const fullPath = path.join(workspaceRoot, attack)
        expect(() => ensurePathWithinWorkspace(fullPath, workspaceRoot)).toThrow()
      }
    })

    it("should block attempts to read other workspace secrets", () => {
      const _otherWorkspace = "/srv/webalive/sites/other-site"
      const attacks = ["../../other-site/.env", "../../../sites/other-site/user/.env"]

      for (const attack of attacks) {
        const fullPath = path.join(workspaceRoot, attack)
        expect(() => ensurePathWithinWorkspace(fullPath, workspaceRoot)).toThrow()
      }
    })

    it("should block attempts to read alive source", () => {
      const attacks = ["../../../../alive/.env", "../../../../alive/domain-passwords.json"]

      for (const attack of attacks) {
        const fullPath = path.join(workspaceRoot, attack)
        expect(() => ensurePathWithinWorkspace(fullPath, workspaceRoot)).toThrow()
      }
    })

    it("should block reading SSH keys", () => {
      const attacks = ["../../../../root/.ssh/id_rsa", "../../../.ssh/authorized_keys"]

      for (const attack of attacks) {
        const fullPath = path.join(workspaceRoot, attack)
        expect(() => ensurePathWithinWorkspace(fullPath, workspaceRoot)).toThrow()
      }
    })
  })

  describe("Edge Cases", () => {
    it("should handle Windows-style paths on Unix systems", () => {
      // Even on Unix, should validate backslashes
      const windowsAttacks = [`${workspaceRoot}\\..\\..\\etc\\passwd`, `${workspaceRoot}\\..\\..\\..\\root\\.bashrc`]

      for (const attack of windowsAttacks) {
        // The function should either reject or normalize to forward slashes
        expect(() => ensurePathWithinWorkspace(attack, workspaceRoot)).toThrow()
      }
    })

    it("should handle very long paths", () => {
      // Extremely long paths should not cause buffer overflow or DoS
      const longPath = path.join(workspaceRoot, `${"a".repeat(10000)}.txt`)
      expect(() => ensurePathWithinWorkspace(longPath, workspaceRoot)).not.toThrow()
    })

    it("should handle paths with special characters", () => {
      const specialPaths = [
        path.join(workspaceRoot, "file with spaces.txt"),
        path.join(workspaceRoot, "file-with-dashes.txt"),
        path.join(workspaceRoot, "file_with_underscores.txt"),
        path.join(workspaceRoot, "file.multiple.dots.txt"),
      ]

      for (const specialPath of specialPaths) {
        expect(() => ensurePathWithinWorkspace(specialPath, workspaceRoot)).not.toThrow()
      }
    })
  })
})
