/**
 * Tests for domain helpers (domainExistsOnThisServer, filterLocalDomains)
 *
 * Uses a mock filesystem in temp directory for reproducible tests.
 */

import { existsSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { SUPERADMIN } from "@webalive/shared"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

// Mock PATHS to use our test directory (must use literal, vi.mock is hoisted)
vi.mock("@webalive/shared", async () => {
  const actual = await vi.importActual<typeof import("@webalive/shared")>("@webalive/shared")
  const os = await import("node:os")
  const nodePath = await import("node:path")
  return {
    ...actual,
    PATHS: {
      ...actual.PATHS,
      SITES_ROOT: nodePath.join(os.tmpdir(), "domains-test-sites"),
    },
  }
})

// Must match the path in the mock above
const MOCK_SITES_ROOT = path.join(tmpdir(), "domains-test-sites")

// Import after mocking
const { domainExistsOnThisServer, filterLocalDomains } = await import("../domains")

// Mock sites that "exist" on this server
const EXISTING_SITES = ["site-a.example.com", "site-b.example.com", "local.test"]

describe("domainExistsOnThisServer", () => {
  beforeAll(() => {
    // Clean up and create mock filesystem
    if (existsSync(MOCK_SITES_ROOT)) {
      rmSync(MOCK_SITES_ROOT, { recursive: true })
    }
    mkdirSync(MOCK_SITES_ROOT, { recursive: true })

    // Create mock site directories
    for (const site of EXISTING_SITES) {
      mkdirSync(path.join(MOCK_SITES_ROOT, site), { recursive: true })
    }
  })

  afterAll(() => {
    // Clean up mock filesystem
    if (existsSync(MOCK_SITES_ROOT)) {
      rmSync(MOCK_SITES_ROOT, { recursive: true })
    }
  })

  it("returns true for sites that exist on filesystem", () => {
    expect(domainExistsOnThisServer("site-a.example.com")).toBe(true)
    expect(domainExistsOnThisServer("site-b.example.com")).toBe(true)
    expect(domainExistsOnThisServer("local.test")).toBe(true)
  })

  it("returns false for sites that don't exist on filesystem", () => {
    expect(domainExistsOnThisServer("nonexistent.com")).toBe(false)
    expect(domainExistsOnThisServer("remote-server.com")).toBe(false)
    expect(domainExistsOnThisServer("totally-fake-domain.xyz")).toBe(false)
  })

  it("always returns true for alive workspace (special case)", () => {
    // alive workspace is the codebase itself, always available
    expect(domainExistsOnThisServer(SUPERADMIN.WORKSPACE_NAME)).toBe(true)
  })

  // macOS filesystem is case-insensitive by default, so skip this test on macOS
  it.skipIf(process.platform === "darwin")("is case-sensitive (filesystem is case-sensitive on Linux)", () => {
    expect(domainExistsOnThisServer("site-a.example.com")).toBe(true)
    expect(domainExistsOnThisServer("Site-A.Example.Com")).toBe(false)
    expect(domainExistsOnThisServer("SITE-A.EXAMPLE.COM")).toBe(false)
  })
})

describe("filterLocalDomains", () => {
  beforeAll(() => {
    // Ensure mock filesystem exists
    if (!existsSync(MOCK_SITES_ROOT)) {
      mkdirSync(MOCK_SITES_ROOT, { recursive: true })
      for (const site of EXISTING_SITES) {
        mkdirSync(path.join(MOCK_SITES_ROOT, site), { recursive: true })
      }
    }
  })

  afterAll(() => {
    if (existsSync(MOCK_SITES_ROOT)) {
      rmSync(MOCK_SITES_ROOT, { recursive: true })
    }
  })

  it("filters to only domains that exist locally", () => {
    const input = ["site-a.example.com", "remote.com", "site-b.example.com", "other-remote.com"]
    const result = filterLocalDomains(input)

    expect(result).toEqual(["site-a.example.com", "site-b.example.com"])
  })

  it("returns empty array when no domains exist locally", () => {
    const input = ["remote-1.com", "remote-2.com", "remote-3.com"]
    const result = filterLocalDomains(input)

    expect(result).toEqual([])
  })

  it("returns all domains when all exist locally", () => {
    const result = filterLocalDomains(EXISTING_SITES)

    expect(result).toEqual(EXISTING_SITES)
  })

  it("handles empty input", () => {
    expect(filterLocalDomains([])).toEqual([])
  })

  it("includes alive workspace when present", () => {
    const input = [SUPERADMIN.WORKSPACE_NAME, "remote.com"]
    const result = filterLocalDomains(input)

    expect(result).toContain(SUPERADMIN.WORKSPACE_NAME)
    expect(result).not.toContain("remote.com")
  })

  it("preserves order of existing domains", () => {
    const input = ["site-b.example.com", "remote.com", "site-a.example.com"]
    const result = filterLocalDomains(input)

    expect(result).toEqual(["site-b.example.com", "site-a.example.com"])
  })
})
