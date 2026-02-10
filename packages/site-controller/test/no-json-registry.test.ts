/**
 * Verify site deployments work without domain-passwords.json
 *
 * After removing the JSON registry (issue #41), the deployment pipeline
 * must have zero references to domain-passwords.json, loadDomainPasswords,
 * REGISTRY_PATH, or any JSON-file-based port storage.
 *
 * Port assignment flows exclusively through Supabase app.domains.
 */

import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const SITE_CONTROLLER_ROOT = path.resolve(__dirname, "..")
const WEB_APP_ROOT = path.resolve(__dirname, "../../../apps/web")

/** Recursively collect all source files (.ts, .tsx, .sh) under a directory */
function collectSourceFiles(dir: string, ext: string[] = [".ts", ".tsx", ".sh"]): string[] {
  const files: string[] = []
  function walk(d: string) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue
        walk(full)
      } else if (ext.some(e => entry.name.endsWith(e))) {
        files.push(full)
      }
    }
  }
  walk(dir)
  return files
}

describe("No JSON Registry References", () => {
  const BANNED_PATTERNS = [
    /domain-passwords\.json/,
    /loadDomainPasswords/,
    /getDomainPasswordsPath/,
    /REGISTRY_PATH/,
    /registryPath/,
  ]

  describe("site-controller package", () => {
    const files = collectSourceFiles(path.join(SITE_CONTROLLER_ROOT, "src")).concat(
      collectSourceFiles(path.join(SITE_CONTROLLER_ROOT, "scripts")),
    )

    it("should have source files to check", () => {
      expect(files.length).toBeGreaterThan(0)
    })

    for (const pattern of BANNED_PATTERNS) {
      it(`should have no references to ${pattern.source}`, () => {
        for (const file of files) {
          const content = readFileSync(file, "utf-8")
          const rel = path.relative(SITE_CONTROLLER_ROOT, file)
          expect(content, `Found banned pattern in ${rel}`).not.toMatch(pattern)
        }
      })
    }
  })

  describe("deploy-site.ts (web app)", () => {
    const deploySitePath = path.join(WEB_APP_ROOT, "lib/deployment/deploy-site.ts")

    for (const pattern of BANNED_PATTERNS) {
      it(`should have no references to ${pattern.source}`, () => {
        const content = readFileSync(deploySitePath, "utf-8")
        expect(content).not.toMatch(pattern)
      })
    }
  })

  describe("deploy-subdomain route (web app)", () => {
    const routePath = path.join(WEB_APP_ROOT, "app/api/deploy-subdomain/route.ts")

    for (const pattern of BANNED_PATTERNS) {
      it(`should have no references to ${pattern.source}`, () => {
        const content = readFileSync(routePath, "utf-8")
        expect(content).not.toMatch(pattern)
      })
    }
  })

  describe("shared config package", () => {
    const configPath = path.resolve(SITE_CONTROLLER_ROOT, "../../packages/shared/src/config.ts")

    for (const pattern of BANNED_PATTERNS) {
      it(`should have no references to ${pattern.source}`, () => {
        const content = readFileSync(configPath, "utf-8")
        expect(content).not.toMatch(pattern)
      })
    }
  })
})

describe("Port Assignment Uses Supabase", () => {
  it("00-assign-port.sh should query app.domains", () => {
    const scriptPath = path.join(SITE_CONTROLLER_ROOT, "scripts/00-assign-port.sh")
    const content = readFileSync(scriptPath, "utf-8")

    expect(content).toContain("app.domains")
    expect(content).toContain("DATABASE_URL")
    expect(content).not.toContain("domain-passwords")
  })

  it("port.ts executor should require DATABASE_URL", () => {
    const portPath = path.join(SITE_CONTROLLER_ROOT, "src/executors/port.ts")
    const content = readFileSync(portPath, "utf-8")

    expect(content).toContain("DATABASE_URL")
    expect(content).not.toContain("domain-passwords")
    expect(content).not.toContain("registryPath")
  })

  it("orchestrator.ts should not reference JSON registry", () => {
    const orchPath = path.join(SITE_CONTROLLER_ROOT, "src/orchestrator.ts")
    const content = readFileSync(orchPath, "utf-8")

    expect(content).not.toContain("domain-passwords")
    expect(content).not.toContain("registryPath")
    expect(content).not.toContain("REGISTRY_PATH")
  })

  it("deploySite() returns port from SiteOrchestrator (no JSON read-back)", () => {
    const deploySitePath = path.join(WEB_APP_ROOT, "lib/deployment/deploy-site.ts")
    const content = readFileSync(deploySitePath, "utf-8")

    // Should use SiteOrchestrator.deploy result
    expect(content).toContain("SiteOrchestrator")
    expect(content).toContain("result.port")

    // Should not read from any JSON file
    expect(content).not.toContain("readFileSync")
    expect(content).not.toContain("JSON.parse")
    expect(content).not.toContain("domain-passwords")
  })
})
