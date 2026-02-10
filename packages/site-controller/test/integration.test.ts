import { describe, expect, it } from "vitest"
import { PATHS, SiteOrchestrator } from "../src/index"

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
    // PATHS values derive from server-config.json at runtime.
    // In CI/test without config, they are empty strings.
    expect(typeof PATHS.SITES_ROOT).toBe("string")
    expect(typeof PATHS.TEMPLATE_PATH).toBe("string")
  })
})

describe("Configuration", () => {
  it("should have correct static paths", () => {
    // These are always the same regardless of server config
    expect(PATHS.SYSTEMD_ENV_DIR).toBe("/etc/sites")
    expect(PATHS.CADDY_LOCK).toBe("/tmp/caddyfile.lock")
  })

  it("should derive dynamic paths from SERVER_CONFIG_PATH", () => {
    // Dynamic paths come from server-config.json — empty in test without config
    expect(typeof PATHS.SERVER_CONFIG).toBe("string")
    expect(typeof PATHS.GENERATED_DIR).toBe("string")
    expect(typeof PATHS.CADDYFILE_SITES).toBe("string")
  })
})
