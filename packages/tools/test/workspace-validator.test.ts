/**
 * Workspace Validator Tests
 *
 * Security-critical tests for path validation and domain extraction.
 * These tests ensure path traversal attacks are blocked and domain
 * extraction works correctly for all edge cases.
 */

import { describe, expect, it, vi, beforeEach } from "vitest"
import { resolve } from "node:path"

// Use vi.hoisted to define mocks before vi.mock hoisting
const { existsSyncMock, TEST_WORKSPACE_BASES } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(() => true),
  TEST_WORKSPACE_BASES: ["/srv/webalive/sites", "/srv/webalive/legacy"] as const,
}))

// Mock existsSync
vi.mock("node:fs", () => ({
  existsSync: existsSyncMock,
}))

// Mock @webalive/shared to provide test values
vi.mock("@webalive/shared", () => ({
  SECURITY: {
    ALLOWED_WORKSPACE_BASES: TEST_WORKSPACE_BASES,
  },
  isPathWithinWorkspace: (filePath: string, basePath: string) => {
    const { resolve } = require("node:path")
    const resolvedFile = resolve(filePath)
    const resolvedBase = resolve(basePath)
    return resolvedFile === resolvedBase || resolvedFile.startsWith(resolvedBase + "/")
  },
}))

// Import after mocking
import { validateWorkspacePath, extractDomainFromWorkspace, hasPackageJson } from "../src/lib/workspace-validator"

const ALLOWED_BASES = TEST_WORKSPACE_BASES

describe("validateWorkspacePath", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    existsSyncMock.mockReturnValue(true)
  })

  describe("path traversal attacks", () => {
    it("rejects ../../../etc/passwd", () => {
      const maliciousPath = "../../../etc/passwd"
      expect(() => validateWorkspacePath(maliciousPath)).toThrow("Invalid workspace path")
    })

    it("rejects path with .. in the middle", () => {
      const maliciousPath = `${ALLOWED_BASES[0]}/example.com/../../../etc/passwd`
      expect(() => validateWorkspacePath(maliciousPath)).toThrow("Invalid workspace path")
    })

    it("rejects path that resolves outside workspace via ..", () => {
      // This path looks like it's in the workspace but resolves outside
      const maliciousPath = `${ALLOWED_BASES[0]}/../../../etc/passwd`
      expect(() => validateWorkspacePath(maliciousPath)).toThrow("Invalid workspace path")
    })

    it("rejects absolute path to /etc/passwd", () => {
      expect(() => validateWorkspacePath("/etc/passwd")).toThrow("Invalid workspace path")
    })

    it("rejects path with encoded traversal (literal %2e%2e)", () => {
      // Even if someone tries URL encoding, path.resolve handles it as literal
      const encodedPath = `${ALLOWED_BASES[0]}/%2e%2e/%2e%2e/etc/passwd`
      // This will be treated as a literal directory name, but resolve() normalizes
      // The resolved path would be under the allowed base if %2e%2e is treated literally
      // But we're checking that the security is path-based, not string-based
      const resolved = resolve(encodedPath)
      // If resolved path escapes, it should fail
      if (!resolved.startsWith(ALLOWED_BASES[0])) {
        expect(() => validateWorkspacePath(encodedPath)).toThrow("Invalid workspace path")
      }
    })

    it("rejects symlink-like path attempts via resolve normalization", () => {
      // path.resolve normalizes these
      const pathWithDots = `${ALLOWED_BASES[0]}/./../../etc/passwd`
      expect(() => validateWorkspacePath(pathWithDots)).toThrow("Invalid workspace path")
    })
  })

  describe("exact base matches", () => {
    it("allows exact match of first allowed base", () => {
      expect(() => validateWorkspacePath(ALLOWED_BASES[0])).not.toThrow()
    })

    it("allows exact match of second allowed base", () => {
      expect(() => validateWorkspacePath(ALLOWED_BASES[1])).not.toThrow()
    })

    it("verifies existsSync is called for valid paths", () => {
      validateWorkspacePath(ALLOWED_BASES[0])
      expect(existsSyncMock).toHaveBeenCalledWith(ALLOWED_BASES[0])
    })
  })

  describe("subdirectories under allowed bases", () => {
    it("allows subdirectory one level deep", () => {
      const validPath = `${ALLOWED_BASES[0]}/example.com`
      expect(() => validateWorkspacePath(validPath)).not.toThrow()
    })

    it("allows subdirectory multiple levels deep", () => {
      const validPath = `${ALLOWED_BASES[0]}/example.com/user/src/components`
      expect(() => validateWorkspacePath(validPath)).not.toThrow()
    })

    it("allows path with trailing slash (normalized)", () => {
      const validPath = `${ALLOWED_BASES[0]}/example.com/`
      // resolve() strips trailing slash
      expect(() => validateWorkspacePath(validPath)).not.toThrow()
    })

    it("allows paths under second allowed base", () => {
      const validPath = `${ALLOWED_BASES[1]}/legacy-site.com/user`
      expect(() => validateWorkspacePath(validPath)).not.toThrow()
    })
  })

  describe("sibling and outside paths rejected", () => {
    it("rejects path that is sibling of allowed base", () => {
      // /srv/webalive/other instead of /srv/webalive/sites
      expect(() => validateWorkspacePath("/srv/webalive/other")).toThrow("Invalid workspace path")
    })

    it("rejects parent of allowed base", () => {
      expect(() => validateWorkspacePath("/srv/webalive")).toThrow("Invalid workspace path")
    })

    it("rejects root path", () => {
      expect(() => validateWorkspacePath("/")).toThrow("Invalid workspace path")
    })

    it("rejects home directory", () => {
      expect(() => validateWorkspacePath("/home/user")).toThrow("Invalid workspace path")
    })

    it("rejects /tmp", () => {
      expect(() => validateWorkspacePath("/tmp")).toThrow("Invalid workspace path")
    })
  })

  describe("boundary cases - prefix but not proper segment", () => {
    it("rejects path that has base as prefix but not as segment", () => {
      // /srv/webalive/sitesmalicious is NOT a valid subdirectory of /srv/webalive/sites
      const maliciousPath = `${ALLOWED_BASES[0]}malicious`
      expect(() => validateWorkspacePath(maliciousPath)).toThrow("Invalid workspace path")
    })

    it("rejects path like /srv/webalive/sites-extra", () => {
      const maliciousPath = "/srv/webalive/sites-extra/something"
      expect(() => validateWorkspacePath(maliciousPath)).toThrow("Invalid workspace path")
    })

    it("rejects path like /srv/webalive/sites_backup", () => {
      const maliciousPath = "/srv/webalive/sites_backup/data"
      expect(() => validateWorkspacePath(maliciousPath)).toThrow("Invalid workspace path")
    })

    it("properly handles base + slash + path", () => {
      // This SHOULD be allowed: base + "/" + path
      const validPath = `${ALLOWED_BASES[0]}/domain.com`
      expect(() => validateWorkspacePath(validPath)).not.toThrow()
    })
  })

  describe("path existence validation", () => {
    it("throws when path does not exist", () => {
      existsSyncMock.mockReturnValue(false)
      expect(() => validateWorkspacePath(`${ALLOWED_BASES[0]}/nonexistent.com`)).toThrow(
        "Workspace path does not exist",
      )
    })

    it("validates existence after security check", () => {
      existsSyncMock.mockReturnValue(false)
      // Security check should happen first (Invalid workspace path)
      // then existence check
      expect(() => validateWorkspacePath("/etc/passwd")).toThrow("Invalid workspace path")
      // existsSync should NOT be called for invalid paths
      expect(existsSyncMock).not.toHaveBeenCalled()
    })
  })

  describe("path normalization via resolve()", () => {
    it("normalizes paths with . segments", () => {
      const pathWithDot = `${ALLOWED_BASES[0]}/./example.com`
      expect(() => validateWorkspacePath(pathWithDot)).not.toThrow()
    })

    it("normalizes paths with redundant slashes", () => {
      const pathWithSlashes = `${ALLOWED_BASES[0]}//example.com`
      expect(() => validateWorkspacePath(pathWithSlashes)).not.toThrow()
    })

    it("resolves relative paths from cwd (which should fail)", () => {
      // Relative paths resolve from cwd, which is likely not in allowed bases
      const relativePath = "example.com"
      const resolved = resolve(relativePath)
      // Unless cwd happens to be an allowed base, this should fail
      if (!ALLOWED_BASES.some(base => resolved === base || resolved.startsWith(`${base}/`))) {
        expect(() => validateWorkspacePath(relativePath)).toThrow("Invalid workspace path")
      }
    })
  })
})

describe("extractDomainFromWorkspace", () => {
  describe("valid domain extraction", () => {
    it("extracts domain from standard path structure", () => {
      const workspace = `${ALLOWED_BASES[0]}/example.com/user`
      expect(extractDomainFromWorkspace(workspace)).toBe("example.com")
    })

    it("extracts domain from path without subdirectory", () => {
      const workspace = `${ALLOWED_BASES[0]}/example.com`
      expect(extractDomainFromWorkspace(workspace)).toBe("example.com")
    })

    it("extracts domain with subdomain", () => {
      const workspace = `${ALLOWED_BASES[0]}/sub.example.com/user`
      expect(extractDomainFromWorkspace(workspace)).toBe("sub.example.com")
    })

    it("extracts domain from deeply nested path", () => {
      const workspace = `${ALLOWED_BASES[0]}/mysite.com/user/src/components/ui`
      expect(extractDomainFromWorkspace(workspace)).toBe("mysite.com")
    })

    it("extracts domain from second allowed base", () => {
      const workspace = `${ALLOWED_BASES[1]}/legacy.com/user`
      expect(extractDomainFromWorkspace(workspace)).toBe("legacy.com")
    })

    it("handles domains with hyphens", () => {
      const workspace = `${ALLOWED_BASES[0]}/my-awesome-site.com/user`
      expect(extractDomainFromWorkspace(workspace)).toBe("my-awesome-site.com")
    })

    it("handles domains with numbers", () => {
      const workspace = `${ALLOWED_BASES[0]}/site123.com/user`
      expect(extractDomainFromWorkspace(workspace)).toBe("site123.com")
    })

    it("handles .nl TLD", () => {
      const workspace = `${ALLOWED_BASES[0]}/example.nl/user`
      expect(extractDomainFromWorkspace(workspace)).toBe("example.nl")
    })

    it("handles alive.best subdomain pattern", () => {
      const workspace = `${ALLOWED_BASES[0]}/mysite.alive.best/user`
      expect(extractDomainFromWorkspace(workspace)).toBe("mysite.alive.best")
    })
  })

  describe("path traversal in domain extraction", () => {
    it("throws for path traversal attempt", () => {
      const maliciousPath = "../../../etc/passwd"
      expect(() => extractDomainFromWorkspace(maliciousPath)).toThrow("not within allowed workspace bases")
    })

    it("throws for path outside allowed bases", () => {
      expect(() => extractDomainFromWorkspace("/etc/passwd")).toThrow("not within allowed workspace bases")
    })
  })

  describe("edge cases - base directory without domain", () => {
    it("throws when path is exactly the base directory", () => {
      expect(() => extractDomainFromWorkspace(ALLOWED_BASES[0])).toThrow("path is exactly the base directory")
    })

    it("throws when path is exactly second base directory", () => {
      expect(() => extractDomainFromWorkspace(ALLOWED_BASES[1])).toThrow("path is exactly the base directory")
    })

    it("throws when base has trailing slash only", () => {
      // resolve() normalizes this to base without trailing slash
      const pathWithSlash = `${ALLOWED_BASES[0]}/`
      // After resolve, this becomes the base itself
      const resolved = resolve(pathWithSlash)
      if (resolved === ALLOWED_BASES[0]) {
        expect(() => extractDomainFromWorkspace(pathWithSlash)).toThrow("path is exactly the base directory")
      }
    })
  })

  describe("invalid paths", () => {
    it("throws for empty string", () => {
      // Empty string resolves to cwd, which should be outside allowed bases
      const resolved = resolve("")
      if (!ALLOWED_BASES.some(base => resolved === base || resolved.startsWith(`${base}/`))) {
        expect(() => extractDomainFromWorkspace("")).toThrow()
      }
    })

    it("throws for sibling path of allowed base", () => {
      expect(() => extractDomainFromWorkspace("/srv/webalive/other")).toThrow("not within allowed workspace bases")
    })

    it("throws for parent of allowed base", () => {
      expect(() => extractDomainFromWorkspace("/srv/webalive")).toThrow("not within allowed workspace bases")
    })
  })

  describe("boundary cases - prefix matching", () => {
    it("throws for path that has base as prefix but not segment", () => {
      // /srv/webalive/sitesmalicious should NOT match /srv/webalive/sites
      const maliciousPath = `${ALLOWED_BASES[0]}malicious/domain.com`
      expect(() => extractDomainFromWorkspace(maliciousPath)).toThrow("not within allowed workspace bases")
    })

    it("correctly handles proper segment boundary", () => {
      // /srv/webalive/sites/domain.com should work
      const validPath = `${ALLOWED_BASES[0]}/domain.com`
      expect(extractDomainFromWorkspace(validPath)).toBe("domain.com")
    })
  })

  describe("path normalization", () => {
    it("normalizes .. in middle of valid path and extracts correctly", () => {
      // This path resolves to a valid location
      const path = `${ALLOWED_BASES[0]}/example.com/../other.com/user`
      // Resolves to: /srv/webalive/sites/other.com/user
      expect(extractDomainFromWorkspace(path)).toBe("other.com")
    })

    it("normalizes . segments", () => {
      const path = `${ALLOWED_BASES[0]}/./example.com/user`
      expect(extractDomainFromWorkspace(path)).toBe("example.com")
    })

    it("handles redundant slashes", () => {
      const path = `${ALLOWED_BASES[0]}//example.com//user`
      expect(extractDomainFromWorkspace(path)).toBe("example.com")
    })
  })
})

describe("hasPackageJson", () => {
  beforeEach(() => {
    existsSyncMock.mockClear()
  })

  it("returns true when package.json exists", () => {
    existsSyncMock.mockReturnValue(true)
    expect(hasPackageJson("/some/path")).toBe(true)
  })

  it("returns false when package.json does not exist", () => {
    existsSyncMock.mockReturnValue(false)
    expect(hasPackageJson("/some/path")).toBe(false)
  })

  it("checks the correct path for package.json", () => {
    const workspace = "/srv/webalive/sites/example.com"
    hasPackageJson(workspace)
    expect(existsSyncMock).toHaveBeenCalledWith(resolve(workspace, "package.json"))
  })
})

describe("integration: validateWorkspacePath + extractDomainFromWorkspace", () => {
  beforeEach(() => {
    existsSyncMock.mockClear()
    existsSyncMock.mockReturnValue(true)
  })

  it("validates and extracts domain for valid path", () => {
    const workspace = `${ALLOWED_BASES[0]}/example.com/user`
    expect(() => validateWorkspacePath(workspace)).not.toThrow()
    expect(extractDomainFromWorkspace(workspace)).toBe("example.com")
  })

  it("both functions reject the same invalid paths", () => {
    const invalidPaths = ["/etc/passwd", "../../../etc/passwd", "/srv/webalive/other", `${ALLOWED_BASES[0]}malicious`]

    for (const path of invalidPaths) {
      expect(() => validateWorkspacePath(path)).toThrow()
      expect(() => extractDomainFromWorkspace(path)).toThrow()
    }
  })
})
