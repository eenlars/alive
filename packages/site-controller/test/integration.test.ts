import { describe, it, expect } from "vitest"
import { SiteOrchestrator, PATHS } from "../src/index"

/**
 * Basic integration tests for site-controller
 *
 * These are smoke tests to verify the package builds and imports work correctly.
 * Full deployment tests should be run in a controlled environment.
 */

describe("SiteOrchestrator", () => {
  it("should export SiteOrchestrator class", () => {
    expect(SiteOrchestrator).toBeDefined()
    expect(typeof SiteOrchestrator.deploy).toBe("function")
    expect(typeof SiteOrchestrator.teardown).toBe("function")
  })

  it("should export PATHS constant", () => {
    expect(PATHS).toBeDefined()
    expect(PATHS.SITES_ROOT).toBe("/srv/webalive/sites")
    expect(PATHS.TEMPLATE_PATH).toBe("/root/alive/templates/site-template")
  })
})

describe("Configuration", () => {
  it("should have correct default paths", () => {
    expect(PATHS.REGISTRY_PATH).toBe("/var/lib/alive/domain-passwords.json")
    expect(PATHS.CADDYFILE_PATH).toBe("/root/alive/ops/caddy/Caddyfile")
    expect(PATHS.SYSTEMD_ENV_DIR).toBe("/etc/sites")
  })
})
