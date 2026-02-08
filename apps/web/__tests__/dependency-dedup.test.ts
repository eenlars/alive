/**
 * Dependency Deduplication Tests
 *
 * Packages that use React Context (like @tanstack/react-query) MUST be
 * deduplicated to a single version. If two versions exist, a Provider
 * sets context on one copy while hooks read from another, causing
 * "No QueryClient set" or similar runtime crashes.
 *
 * Root cause example: @flowglad/react pinned @tanstack/react-query@5.66.0
 * while we used 5.90.20, creating two copies. The QueryClientProvider
 * set context on 5.90.20 but useQuery in settings read from 5.66.0.
 *
 * @see https://github.com/eenlars/alive/pull/31
 */

import { execSync } from "node:child_process"
import { describe, expect, it } from "vitest"

/**
 * Packages that use React Context and MUST exist as a single version.
 * If duplicated, Provider/Consumer mismatches cause runtime crashes.
 */
const CONTEXT_SENSITIVE_PACKAGES = ["@tanstack/react-query", "@tanstack/query-core", "react", "react-dom", "zustand"]

describe("Dependency Deduplication", () => {
  for (const pkg of CONTEXT_SENSITIVE_PACKAGES) {
    it(`CRITICAL: ${pkg} must have exactly one version installed`, () => {
      const output = execSync(`bun pm ls 2>/dev/null | grep "${pkg}@" || true`, {
        cwd: process.cwd(),
        encoding: "utf-8",
        stdio: "pipe",
      })

      // Extract unique version numbers from "package@version" patterns
      const versionRegex = new RegExp(`${pkg.replace("/", "/")}@(\\d+\\.\\d+\\.\\d+)`, "g")
      const versions = new Set<string>()
      for (const match of output.matchAll(versionRegex)) {
        versions.add(match[1])
      }

      if (versions.size > 1) {
        const versionList = [...versions].join(", ")
        expect.fail(
          `Found ${versions.size} versions of ${pkg}: ${versionList}\n` +
            "Packages using React Context must be deduplicated to prevent Provider/Consumer mismatches.\n" +
            `Fix: Add "${pkg}" to "overrides" in root package.json.\n` +
            `Debug: Run "bun pm why ${pkg}" to find which dependency pulls in the extra version.`,
        )
      }
    })
  }
})
