import { existsSync } from "node:fs"
import { DEFAULTS, PATHS, PORTS } from "@webalive/shared"
import { checkDomainInCaddy, configureCaddy, SiteOrchestrator } from "@webalive/site-controller"
import { normalizeAndValidateDomain } from "@/features/manager/lib/domain-utils"
import { ErrorCodes } from "@/lib/error-codes"
import { deploySite } from "./deploy-site"
import { DomainRegistrationError, isDomainRegistered, registerDomain, unregisterDomain } from "./domain-registry"

export interface StrictDeploymentInput {
  domain: string
  email: string
  password?: string
  orgId?: string
  templatePath: string
}

export interface StrictDeploymentResult {
  domain: string
  port: number
  serviceName: string
}

function validateInput(input: StrictDeploymentInput): {
  domain: string
  email: string
  password?: string
  orgId?: string
  templatePath: string
} {
  const normalized = normalizeAndValidateDomain(input.domain)
  if (!normalized.isValid) {
    throw new DomainRegistrationError(ErrorCodes.INVALID_DOMAIN, normalized.error || "Invalid domain", {
      domain: input.domain,
    })
  }

  const email = input.email.trim()
  if (!email) {
    throw new DomainRegistrationError(ErrorCodes.VALIDATION_ERROR, "Email is required", {
      field: "email",
    })
  }

  const templatePath = input.templatePath.trim()
  if (!templatePath) {
    throw new DomainRegistrationError(ErrorCodes.VALIDATION_ERROR, "Template path is required", {
      field: "templatePath",
    })
  }

  if (input.orgId !== undefined && input.orgId.trim().length === 0) {
    throw new DomainRegistrationError(ErrorCodes.VALIDATION_ERROR, "Organization ID cannot be empty", {
      field: "orgId",
    })
  }

  return {
    domain: normalized.domain,
    email,
    password: input.password,
    orgId: input.orgId,
    templatePath,
  }
}

function validatePort(domain: string, port: number): number {
  if (!Number.isInteger(port)) {
    throw new DomainRegistrationError(ErrorCodes.DEPLOYMENT_FAILED, "Deployment returned a non-integer port", {
      domain,
      port,
    })
  }

  if (port < PORTS.SITE_RANGE.MIN || port > PORTS.SITE_RANGE.MAX) {
    throw new DomainRegistrationError(
      ErrorCodes.DEPLOYMENT_FAILED,
      `Deployment returned an out-of-range port (${PORTS.SITE_RANGE.MIN}-${PORTS.SITE_RANGE.MAX})`,
      {
        domain,
        port,
      },
    )
  }

  return port
}

function getRoutingVerificationPath(): string | null {
  const serverConfigPath = process.env.SERVER_CONFIG_PATH
  const generatorMode = !!serverConfigPath && existsSync(serverConfigPath)

  if (generatorMode && PATHS.CADDYFILE_SITES && existsSync(PATHS.CADDYFILE_SITES)) {
    return PATHS.CADDYFILE_SITES
  }

  if (PATHS.CADDYFILE_PATH && existsSync(PATHS.CADDYFILE_PATH)) {
    return PATHS.CADDYFILE_PATH
  }

  return null
}

async function verifyRouting(domain: string): Promise<void> {
  const verificationPath = getRoutingVerificationPath()
  if (!verificationPath) {
    return
  }

  const hasRoute = await checkDomainInCaddy(domain, verificationPath)
  if (!hasRoute) {
    throw new DomainRegistrationError(ErrorCodes.DEPLOYMENT_FAILED, "Caddy routing verification failed after reload", {
      domain,
      caddyfile: verificationPath,
    })
  }
}

async function rollbackAfterPipelineFailure(params: {
  domain: string
  siteExistedBefore: boolean
  domainExistedBefore: boolean
}): Promise<void> {
  const rollbackErrors: string[] = []

  // If this domain did not exist in DB before this run, remove any record we may have created.
  if (!params.domainExistedBefore) {
    try {
      const nowRegistered = await isDomainRegistered(params.domain)
      if (nowRegistered) {
        await unregisterDomain(params.domain)
      }
    } catch (error) {
      rollbackErrors.push(`db-unregister: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Only teardown infrastructure if it didn't exist before this attempt.
  if (!params.siteExistedBefore) {
    try {
      await SiteOrchestrator.teardown(params.domain, {
        removeFiles: true,
        removeUser: true,
      })
    } catch (error) {
      rollbackErrors.push(`infra-teardown: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (rollbackErrors.length > 0) {
    console.error(`[Deploy Pipeline] Rollback incomplete for ${params.domain}: ${rollbackErrors.join(" | ")}`)
  }
}

/**
 * Single strict deployment pipeline for API routes:
 * deploy infrastructure -> register domain -> regenerate/reload Caddy -> verify routing.
 */
export async function runStrictDeployment(input: StrictDeploymentInput): Promise<StrictDeploymentResult> {
  const validated = validateInput(input)
  const siteExistedBefore = existsSync(`${PATHS.SITES_ROOT}/${validated.domain}`)
  const domainExistedBefore = await isDomainRegistered(validated.domain)

  const deployResult = await deploySite({
    domain: validated.domain,
    email: validated.email,
    password: validated.password,
    orgId: validated.orgId,
    templatePath: validated.templatePath,
  })

  try {
    const port = validatePort(validated.domain, deployResult.port)

    await registerDomain({
      hostname: validated.domain,
      email: validated.email,
      password: validated.password,
      port,
      orgId: validated.orgId,
    })

    await configureCaddy({
      domain: validated.domain,
      port,
      caddyfilePath: PATHS.CADDYFILE_PATH,
      caddyLockPath: PATHS.CADDY_LOCK,
      flockTimeout: DEFAULTS.FLOCK_TIMEOUT,
    })

    await verifyRouting(validated.domain)

    return {
      domain: validated.domain,
      port,
      serviceName: deployResult.serviceName,
    }
  } catch (error) {
    await rollbackAfterPipelineFailure({
      domain: validated.domain,
      siteExistedBefore,
      domainExistedBefore,
    })
    throw error
  }
}
