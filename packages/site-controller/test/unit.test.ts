import { describe, expect, it } from "vitest"
import { DEFAULTS, PATHS } from "../src/config"

describe("Configuration Constants", () => {
  it("should have valid site root path", () => {
    expect(PATHS.SITES_ROOT).toMatch(/^\//)
  })

  it("should have valid Caddyfile path", () => {
    expect(PATHS.CADDYFILE_PATH).toMatch(/Caddyfile$/)
  })

  it("should have valid systemd paths", () => {
    expect(PATHS.SYSTEMD_ENV_DIR).toBe("/etc/sites")
  })

  it("should have valid lock timeout", () => {
    expect(DEFAULTS.FLOCK_TIMEOUT).toBeGreaterThan(0)
    expect(typeof DEFAULTS.FLOCK_TIMEOUT).toBe("number")
  })
})

describe("Port Range Validation", () => {
  it("should have valid port range", () => {
    expect(DEFAULTS.PORT_RANGE.MIN).toBe(3333)
    expect(DEFAULTS.PORT_RANGE.MAX).toBe(3999)
    expect(DEFAULTS.PORT_RANGE.MIN).toBeLessThan(DEFAULTS.PORT_RANGE.MAX)
  })
})

describe("Server Configuration", () => {
  it("should have valid server IP", () => {
    expect(DEFAULTS.SERVER_IP).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)
  })

  it("should have valid wildcard domain", () => {
    expect(DEFAULTS.WILDCARD_DOMAIN).toBeTruthy()
  })
})
