/**
 * Tests for deploySite() wrapper
 *
 * Critical: deploySite must pass skipCaddy: true to SiteOrchestrator.deploy()
 * so the API route can defer Caddy routing until after the domain is written
 * to Supabase. Without this, the routing generator won't see the new domain.
 */

import type { DeployConfig } from "@webalive/site-controller"
import { describe, expect, it, vi } from "vitest"

// Capture deploy calls for assertion
const deployCalls: DeployConfig[] = []

vi.mock("@webalive/site-controller", () => ({
  SiteOrchestrator: {
    deploy: (config: DeployConfig) => {
      deployCalls.push(config)
      return Promise.resolve({
        domain: config.domain,
        port: 3700,
        serviceName: "site@testsite-alive-best.service",
        success: true,
      })
    },
  },
}))

const { deploySite } = await import("../deploy-site")

describe("deploySite", () => {
  it("passes skipCaddy: true to SiteOrchestrator.deploy()", async () => {
    deployCalls.length = 0

    await deploySite({
      domain: "testsite.alive.best",
      email: "test@example.com",
    })

    expect(deployCalls).toHaveLength(1)
    expect(deployCalls[0].skipCaddy).toBe(true)
  })

  it("would fail if skipCaddy were missing (regression guard)", async () => {
    deployCalls.length = 0

    await deploySite({
      domain: "another.alive.best",
      email: "test@example.com",
    })

    // This test documents the contract: if someone removes skipCaddy: true
    // from deploy-site.ts, the routing race condition returns
    expect(deployCalls[0]).toHaveProperty("skipCaddy", true)
  })
})
