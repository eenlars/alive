import { DEFAULTS, PATHS } from "@webalive/shared"
import { SiteOrchestrator } from "@webalive/site-controller"

export interface DeploySiteOptions {
  domain: string
  email: string // REQUIRED: User's email (for account linking and org resolution)
  password?: string // Optional: For new account creation (if user doesn't exist)
  orgId?: string // Optional: Organization ID (for logging/validation, script will resolve independently)
  templatePath?: string // Optional: Path to template (defaults to PATHS.TEMPLATE_PATH)
}

export interface DeploySiteResult {
  port: number
  domain: string
  serviceName: string
}

export async function deploySite(options: DeploySiteOptions): Promise<DeploySiteResult> {
  const domain = options.domain.toLowerCase() // Always lowercase domain
  const templatePath = options.templatePath || PATHS.TEMPLATE_PATH

  console.log(`[Deploy] Deploying: ${domain}`)
  console.log(`[Deploy] Email: ${options.email || "(none - will create new account)"}`)
  console.log(`[Deploy] Template: ${templatePath}`)

  try {
    // Convert domain to slug for systemd compatibility
    const slug = domain.replace(/[^a-z0-9]+/gi, "-").toLowerCase()

    // Use new SiteOrchestrator from site-controller package
    const result = await SiteOrchestrator.deploy({
      domain,
      slug,
      templatePath,
      serverIp: DEFAULTS.SERVER_IP,
      wildcardDomain: DEFAULTS.WILDCARD_DOMAIN,
      rollbackOnFailure: true, // Automatic rollback on failure
    })

    if (!result.success) {
      throw new Error(result.error || `Deployment failed at phase: ${result.failedPhase}`)
    }

    console.log("[Deploy] ✅ Site deployed successfully")
    console.log(`[Deploy] Domain: ${result.domain}`)
    console.log(`[Deploy] Port: ${result.port}`)
    console.log(`[Deploy] Service: ${result.serviceName}`)

    return {
      port: result.port,
      domain: result.domain,
      serviceName: result.serviceName,
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`[Deploy] Error: ${error.message}`)
      throw error
    }

    throw new Error(`Deployment failed: ${String(error)}`)
  }
}
