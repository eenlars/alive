import { PATHS } from "@webalive/shared"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ErrorCodes } from "@/lib/error-codes"

const callOrder: string[] = []

const pathExists = vi.fn<(filePath: string) => boolean>(() => false)
const checkDomainInCaddyMock = vi.fn<(domain: string, caddyfilePath: string) => Promise<boolean>>(async () => true)
const configureCaddyMock = vi.fn<(input: unknown) => Promise<void>>(async () => {
  callOrder.push("configureCaddy")
})
const teardownMock = vi.fn<(domain: string, options: unknown) => Promise<void>>(async () => undefined)
const isDomainRegisteredMock = vi.fn<(hostname: string) => Promise<boolean>>(async () => false)
const unregisterDomainMock = vi.fn<(hostname: string) => Promise<boolean>>(async () => true)
const deploySiteMock = vi.fn<(input: unknown) => Promise<{ domain: string; port: number; serviceName: string }>>(
  async () => ({
    domain: "testsite.alive.best",
    port: 3700,
    serviceName: "site@testsite-alive-best.service",
  }),
)
const registerDomainMock = vi.fn<(input: unknown) => Promise<void>>(async () => undefined)

vi.mock("node:fs", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs")>()
  return {
    ...actual,
    existsSync: (filePath: string) => pathExists(filePath),
  }
})

vi.mock("../deploy-site", () => ({
  deploySite: (input: unknown) => {
    callOrder.push("deploySite")
    return deploySiteMock(input)
  },
}))

vi.mock("../domain-registry", () => ({
  isDomainRegistered: (hostname: string) => isDomainRegisteredMock(hostname),
  registerDomain: (input: unknown) => {
    callOrder.push("registerDomain")
    return registerDomainMock(input)
  },
  unregisterDomain: (hostname: string) => unregisterDomainMock(hostname),
  DomainRegistrationError: class DomainRegistrationError extends Error {
    errorCode: string
    details: Record<string, unknown>
    constructor(errorCode: string, message: string, details: Record<string, unknown> = {}) {
      super(message)
      this.errorCode = errorCode
      this.details = details
    }
  },
}))

vi.mock("@webalive/site-controller", () => ({
  checkDomainInCaddy: (domain: string, caddyfilePath: string) => checkDomainInCaddyMock(domain, caddyfilePath),
  configureCaddy: (input: unknown) => configureCaddyMock(input),
  regeneratePortMap: async () => 1,
  SiteOrchestrator: {
    teardown: (domain: string, options: unknown) => teardownMock(domain, options),
  },
}))

const { runStrictDeployment } = await import("../deploy-pipeline")
const { DomainRegistrationError } = await import("../domain-registry")

describe("runStrictDeployment", () => {
  beforeEach(() => {
    callOrder.length = 0

    pathExists.mockReset()
    pathExists.mockReturnValue(false)

    checkDomainInCaddyMock.mockReset()
    checkDomainInCaddyMock.mockResolvedValue(true)

    configureCaddyMock.mockReset()
    configureCaddyMock.mockImplementation(async () => {
      callOrder.push("configureCaddy")
    })

    teardownMock.mockReset()
    teardownMock.mockResolvedValue(undefined)

    isDomainRegisteredMock.mockReset()
    isDomainRegisteredMock.mockResolvedValue(false)

    unregisterDomainMock.mockReset()
    unregisterDomainMock.mockResolvedValue(true)

    deploySiteMock.mockReset()
    deploySiteMock.mockResolvedValue({
      domain: "testsite.alive.best",
      port: 3700,
      serviceName: "site@testsite-alive-best.service",
    })

    registerDomainMock.mockReset()
    registerDomainMock.mockResolvedValue(undefined)

    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("executes a single strict flow: deploy -> register -> caddy", async () => {
    const result = await runStrictDeployment({
      domain: "TestSite.Alive.Best",
      email: "owner@example.com",
      orgId: "org-1",
      templatePath: "/srv/webalive/sites/blank.alive.best",
    })

    expect(result).toMatchObject({
      domain: "testsite.alive.best",
      port: 3700,
      serviceName: "site@testsite-alive-best.service",
    })

    expect(callOrder).toEqual(["deploySite", "registerDomain", "configureCaddy"])
    expect(configureCaddyMock).toHaveBeenCalledOnce()
    expect(configureCaddyMock.mock.calls[0][0]).toMatchObject({
      domain: "testsite.alive.best",
      port: 3700,
    })
  })

  it("rejects invalid domains before deployment starts", async () => {
    await expect(
      runStrictDeployment({
        domain: "invalid_domain",
        email: "owner@example.com",
        templatePath: "/srv/webalive/sites/blank.alive.best",
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCodes.INVALID_DOMAIN,
    })

    expect(deploySiteMock).not.toHaveBeenCalled()
    expect(registerDomainMock).not.toHaveBeenCalled()
  })

  it("fails when deploy returns an out-of-range port", async () => {
    deploySiteMock.mockResolvedValueOnce({
      domain: "testsite.alive.best",
      port: 9999,
      serviceName: "site@testsite-alive-best.service",
    })

    await expect(
      runStrictDeployment({
        domain: "testsite.alive.best",
        email: "owner@example.com",
        templatePath: "/srv/webalive/sites/blank.alive.best",
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCodes.DEPLOYMENT_FAILED,
    })

    expect(registerDomainMock).not.toHaveBeenCalled()
    expect(configureCaddyMock).not.toHaveBeenCalled()
    expect(teardownMock).toHaveBeenCalledWith("testsite.alive.best", {
      removeFiles: true,
      removeUser: true,
    })
  })

  it("verifies routing after caddy reload when a verification file exists", async () => {
    pathExists.mockReturnValue(true)

    await runStrictDeployment({
      domain: "testsite.alive.best",
      email: "owner@example.com",
      templatePath: "/srv/webalive/sites/blank.alive.best",
    })

    expect(checkDomainInCaddyMock).toHaveBeenCalledTimes(1)
  })

  it("rolls back infrastructure when registerDomain fails for a new deployment", async () => {
    isDomainRegisteredMock.mockResolvedValueOnce(false).mockResolvedValueOnce(false)
    registerDomainMock.mockRejectedValueOnce(
      new DomainRegistrationError(ErrorCodes.DEPLOYMENT_FAILED, "db write failed", {
        domain: "testsite.alive.best",
      }),
    )

    await expect(
      runStrictDeployment({
        domain: "testsite.alive.best",
        email: "owner@example.com",
        templatePath: "/srv/webalive/sites/blank.alive.best",
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCodes.DEPLOYMENT_FAILED,
    })

    expect(unregisterDomainMock).not.toHaveBeenCalled()
    expect(teardownMock).toHaveBeenCalledWith("testsite.alive.best", {
      removeFiles: true,
      removeUser: true,
    })
  })

  it("unregisters domain and tears down infra when caddy step fails on new deployment", async () => {
    isDomainRegisteredMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    configureCaddyMock.mockRejectedValueOnce(new Error("caddy reload failed"))

    await expect(
      runStrictDeployment({
        domain: "testsite.alive.best",
        email: "owner@example.com",
        templatePath: "/srv/webalive/sites/blank.alive.best",
      }),
    ).rejects.toThrow("caddy reload failed")

    expect(unregisterDomainMock).toHaveBeenCalledWith("testsite.alive.best")
    expect(teardownMock).toHaveBeenCalledWith("testsite.alive.best", {
      removeFiles: true,
      removeUser: true,
    })
    expect(checkDomainInCaddyMock).not.toHaveBeenCalled()
  })

  it("rolls back when routing verification fails after caddy reload", async () => {
    pathExists.mockImplementation(filePath => filePath === PATHS.CADDYFILE_PATH)
    isDomainRegisteredMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    checkDomainInCaddyMock.mockResolvedValueOnce(false)

    await expect(
      runStrictDeployment({
        domain: "testsite.alive.best",
        email: "owner@example.com",
        templatePath: "/srv/webalive/sites/blank.alive.best",
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCodes.DEPLOYMENT_FAILED,
    })

    expect(unregisterDomainMock).toHaveBeenCalledWith("testsite.alive.best")
    expect(teardownMock).toHaveBeenCalledWith("testsite.alive.best", {
      removeFiles: true,
      removeUser: true,
    })
  })

  it("does not teardown pre-existing infrastructure on post-deploy failure", async () => {
    pathExists.mockImplementation(filePath => filePath.includes(`${PATHS.SITES_ROOT}/existing.alive.best`))
    isDomainRegisteredMock.mockResolvedValueOnce(true)
    configureCaddyMock.mockRejectedValueOnce(new Error("reload failed"))

    await expect(
      runStrictDeployment({
        domain: "existing.alive.best",
        email: "owner@example.com",
        templatePath: "/srv/webalive/sites/blank.alive.best",
      }),
    ).rejects.toThrow("reload failed")

    expect(unregisterDomainMock).not.toHaveBeenCalled()
    expect(teardownMock).not.toHaveBeenCalled()
  })
})
