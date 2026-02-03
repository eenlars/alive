import { exec } from "node:child_process"
import { readFile } from "node:fs/promises"
import { promisify } from "node:util"
import type { NextRequest } from "next/server"
import {
  createBadRequestResponse,
  createErrorResponse,
  createSuccessResponse,
  getDomainParam,
  requireManagerAuth,
  requireParam,
} from "@/features/manager/lib/api-helpers"
import { domainToSlug, getDomainSitePath, getDomainUser } from "@/features/manager/lib/domain-utils"
import { getDomain } from "@/lib/domains"
import { ErrorCodes } from "@/lib/error-codes"
import type { ViteConfigInfo } from "@/types/domain"

const execAsync = promisify(exec)

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Get Vite config information for a domain
 * GET /api/manager/vite-config?domain=example.com
 */
export async function GET(request: NextRequest) {
  const authError = await requireManagerAuth()
  if (authError) return authError

  const domain = getDomainParam(request)
  const domainError = requireParam(domain, "domain")
  if (domainError) return domainError

  try {
    const info = await getViteConfigInfo(domain!)
    return createSuccessResponse({ info })
  } catch (error) {
    console.error("Failed to get vite config:", error)
    return createErrorResponse(error, "Failed to get vite config")
  }
}

/**
 * Fix Vite config port mismatch
 * POST /api/manager/vite-config
 * Body: { domain: string, action: "fix-port" }
 */
export async function POST(request: NextRequest) {
  const authError = await requireManagerAuth()
  if (authError) return authError

  const body = await request.json()
  const { domain, action } = body

  const domainError = requireParam(domain, "domain")
  if (domainError) return domainError

  if (action !== "fix-port") {
    return createBadRequestResponse("Invalid action")
  }

  try {
    await fixViteConfigPort(domain)
    const info = await getViteConfigInfo(domain)
    return createSuccessResponse({ message: "Port fixed", info })
  } catch (error) {
    console.error("Failed to fix vite config:", error)
    return createErrorResponse(error, "Failed to fix vite config")
  }
}

async function getViteConfigInfo(domain: string): Promise<ViteConfigInfo> {
  const domainConfig = await getDomain(domain)

  if (!domainConfig) {
    throw new Error("Domain not found in registry")
  }

  const expectedPort = domainConfig.port
  const sitePath = getDomainSitePath(domain)
  const slug = domainToSlug(domain)

  // Check for systemd override file
  let hasSystemdOverride = false
  let systemdOverridePort: number | null = null
  const overridePath = `/etc/systemd/system/site@${slug}.service.d/port-override.conf`

  try {
    await execAsync(`test -f "${overridePath}"`)
    hasSystemdOverride = true

    // Try to parse port from override file
    const overrideContent = await readFile(overridePath, "utf-8")
    const portMatch = overrideContent.match(/--port\s+(\d+)/)
    if (portMatch) {
      systemdOverridePort = Number.parseInt(portMatch[1], 10)
    }
  } catch {
    hasSystemdOverride = false
  }

  // Check for vite.config.ts (preferred)
  let configPath: string | null = null
  let configContent: string | null = null

  try {
    const tsPath = `${sitePath}/user/vite.config.ts`
    await execAsync(`test -f "${tsPath}"`)
    configPath = tsPath
    configContent = await readFile(tsPath, "utf-8")
  } catch {
    // Try .js
    try {
      const jsPath = `${sitePath}/user/vite.config.js`
      await execAsync(`test -f "${jsPath}"`)
      configPath = jsPath
      configContent = await readFile(jsPath, "utf-8")
    } catch {
      return {
        domain,
        expectedPort,
        actualPort: null,
        portMismatch: hasSystemdOverride,
        configPath: null,
        allowedHosts: null,
        hasSystemdOverride,
        systemdOverridePort,
        error: ErrorCodes.FILE_READ_ERROR,
      }
    }
  }

  // Parse port from config
  let actualPort: number | null = null
  const portMatch = configContent.match(/port:\s*(\d+)/)
  if (portMatch) {
    actualPort = Number.parseInt(portMatch[1], 10)
  }

  // Parse allowedHosts from config
  let allowedHosts: string[] | null = null
  const allowedHostsMatch = configContent.match(/allowedHosts:\s*\[(.*?)\]/s)
  if (allowedHostsMatch) {
    const hostsStr = allowedHostsMatch[1]
    allowedHosts = hostsStr
      .split(",")
      .map(h => h.trim().replace(/['"]/g, ""))
      .filter(h => h)
  }

  const portMismatch = (actualPort !== null && actualPort !== expectedPort) || hasSystemdOverride

  return {
    domain,
    expectedPort,
    actualPort,
    portMismatch,
    configPath,
    allowedHosts,
    hasSystemdOverride,
    systemdOverridePort,
  }
}

async function fixViteConfigPort(domain: string): Promise<void> {
  const info = await getViteConfigInfo(domain)
  const slug = domainToSlug(domain)
  const user = getDomainUser(domain)

  // Step 1: Remove systemd override file if it exists
  if (info.hasSystemdOverride) {
    const overridePath = `/etc/systemd/system/site@${slug}.service.d/port-override.conf`
    try {
      await execAsync(`rm -f "${overridePath}"`)
      await execAsync("systemctl daemon-reload")
    } catch (error) {
      console.error("[Vite Config] Failed to remove systemd override:", error)
      throw new Error("Failed to remove systemd override", { cause: error as Error })
    }
  }

  // Step 2: Fix vite config port if needed
  if (info.configPath && info.actualPort && info.actualPort !== info.expectedPort) {
    // Replace port in config using sed
    // This replaces ALL occurrences of "port: <old>" with "port: <new>"
    try {
      await execAsync(
        `sudo -u ${user} sed -i 's/port: ${info.actualPort}/port: ${info.expectedPort}/g' "${info.configPath}"`,
      )
    } catch (error) {
      console.error("[Vite Config] Failed to update vite config:", error)
      throw new Error("Failed to update vite config", { cause: error as Error })
    }
  }

  // Step 3: Restart the service to apply changes
  try {
    await execAsync(`systemctl restart site@${slug}.service`)
  } catch (error) {
    console.error("Failed to restart service:", error)
    // Don't throw - config was updated successfully
  }
}
