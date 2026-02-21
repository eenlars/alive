import { exec } from "node:child_process"
import { promisify } from "node:util"
import * as Sentry from "@sentry/nextjs"
import { DEFAULTS, PATHS, TIMEOUTS } from "@webalive/shared"
import type { NextRequest } from "next/server"
import { requireManagerAuth } from "@/features/manager/lib/api-helpers"
import { createCorsErrorResponse, createCorsSuccessResponse } from "@/lib/api/responses"
import { getAllDomains } from "@/lib/deployment/domain-registry"
import { ErrorCodes } from "@/lib/error-codes"
import type { DomainStatus } from "@/types/domain"

const execAsync = promisify(exec)

async function checkPortListening(port: number): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`ss -ln | grep -E ':${port}\\s'`)
    return stdout.trim().length > 0
  } catch (_err) {
    // Expected: ss command may fail if port not found
    return false
  }
}

async function checkHttpAccessible(domain: string): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUTS.HTTP_REQUEST)

    const response = await fetch(`http://${domain}`, {
      signal: controller.signal,
      redirect: "manual",
    })

    clearTimeout(timeout)
    return response.status < 500
  } catch (_err) {
    // Expected: domain may be unreachable
    return false
  }
}

async function checkHttpsAccessible(domain: string): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUTS.HTTP_REQUEST)

    const response = await fetch(`https://${domain}`, {
      signal: controller.signal,
      redirect: "manual",
    })

    clearTimeout(timeout)
    return response.status < 500
  } catch (_err) {
    // Expected: domain may be unreachable
    return false
  }
}

async function checkSystemdService(domain: string): Promise<{ exists: boolean; running: boolean }> {
  const serviceName = `site@${domain.replace(/\./g, "-")}.service`

  try {
    const { stdout: statusOutput } = await execAsync(
      `systemctl is-active ${serviceName} 2>/dev/null || echo "inactive"`,
    )
    const running = statusOutput.trim() === "active"

    try {
      await execAsync(`systemctl status ${serviceName} 2>/dev/null`)
      return { exists: true, running }
    } catch (_err) {
      // Expected: service may not exist
      return { exists: running, running }
    }
  } catch (err) {
    Sentry.captureException(err, { tags: { check: "systemd-service" } })
    return { exists: false, running: false }
  }
}

async function checkCaddyConfigured(domain: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      `grep -q "^${domain} {" ${PATHS.CADDYFILE_PATH} && echo "found" || echo "missing"`,
    )
    return stdout.trim() === "found"
  } catch (err) {
    Sentry.captureException(err, { tags: { check: "caddy-config" } })
    return false
  }
}

async function checkSiteDirectory(domain: string): Promise<boolean> {
  try {
    const possiblePaths = [`${PATHS.SITES_ROOT}/${domain}`, `${PATHS.SITES_ROOT}/${domain.replace(/\./g, "-")}`]

    for (const path of possiblePaths) {
      const { stdout } = await execAsync(`test -d ${path} && echo "exists" || echo "missing"`)
      if (stdout.trim() === "exists") {
        return true
      }
    }

    return false
  } catch (err) {
    Sentry.captureException(err, { tags: { check: "site-directory" } })
    return false
  }
}

/**
 * Check DNS resolution by verifying the domain serves our verification file
 * This works with any CDN/proxy setup (Cloudflare, etc.)
 */
async function checkDnsResolution(
  domain: string,
  serverIp: string,
): Promise<{ pointsToServer: boolean; resolvedIp: string | null; isProxied?: boolean; verificationMethod?: string }> {
  try {
    // First, get the resolved IP for display purposes
    const { stdout } = await execAsync(`host -t A ${domain} 2>/dev/null || echo "NXDOMAIN"`)

    let resolvedIp: string | null = null
    if (!stdout.includes("NXDOMAIN") && !stdout.includes("not found")) {
      const match = stdout.match(/has address\s+(\d+\.\d+\.\d+\.\d+)/)
      if (match) {
        resolvedIp = match[1]
      }
    }

    // Try to fetch the verification file via HTTPS first, then HTTP
    const verificationPath = "/.well-known/alive-verify.txt"

    for (const protocol of ["https", "http"]) {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), TIMEOUTS.HTTP_REQUEST)

        const response = await fetch(`${protocol}://${domain}${verificationPath}`, {
          signal: controller.signal,
          redirect: "follow",
        })

        clearTimeout(timeout)

        if (response.ok) {
          const content = (await response.text()).trim()
          const pointsToServer = content === serverIp
          const isProxied = resolvedIp !== null && resolvedIp !== serverIp

          return {
            pointsToServer,
            resolvedIp,
            isProxied,
            verificationMethod: protocol,
          }
        }
      } catch (_err) {
        // Expected: verification endpoint may be unreachable
      }
    }

    // Verification file not found or unreachable
    // Fall back to direct IP comparison
    const directMatch = resolvedIp === serverIp
    return {
      pointsToServer: directMatch,
      resolvedIp,
      isProxied: false,
      verificationMethod: directMatch ? "direct-ip" : "none",
    }
  } catch (err) {
    Sentry.captureException(err, { tags: { check: "dns-resolution" } })
    return { pointsToServer: false, resolvedIp: null, verificationMethod: "error" }
  }
}

async function checkServeMode(domain: string): Promise<"dev" | "build" | "unknown"> {
  const slug = domain.replace(/\./g, "-")
  const overridePath = `/etc/systemd/system/site@${slug}.service.d/override.conf`

  try {
    const { stdout } = await execAsync(`cat "${overridePath}" 2>/dev/null || echo ""`)
    if (stdout.includes("preview")) {
      return "build"
    }
    if (stdout.includes("dev") || stdout.trim() === "") {
      return "dev"
    }
    return "dev" // Default to dev if no override
  } catch (_err) {
    // Expected: override file may not exist
    return "dev"
  }
}

async function checkViteConfigPort(
  domain: string,
  expectedPort: number,
): Promise<{ mismatch: boolean; actualPort: number | null; hasSystemdOverride: boolean }> {
  try {
    const sitePath = `${PATHS.SITES_ROOT}/${domain}`
    const slug = domain.replace(/[^a-zA-Z0-9]/g, "-")

    // Check for systemd override file
    let hasSystemdOverride = false
    try {
      await execAsync(`test -f "/etc/systemd/system/site@${slug}.service.d/port-override.conf"`)
      hasSystemdOverride = true
    } catch (_err) {
      // Expected: override file may not exist
      hasSystemdOverride = false
    }

    // Try vite.config.ts first
    let configPath: string | null = null
    try {
      await execAsync(`test -f "${sitePath}/user/vite.config.ts"`)
      configPath = `${sitePath}/user/vite.config.ts`
    } catch (_err) {
      try {
        await execAsync(`test -f "${sitePath}/user/vite.config.js"`)
        configPath = `${sitePath}/user/vite.config.js`
      } catch (_err) {
        // Expected: config file may not exist
        return { mismatch: hasSystemdOverride, actualPort: null, hasSystemdOverride }
      }
    }

    const { stdout } = await execAsync(`grep -o 'port: [0-9]*' "${configPath}" | head -1`)
    const match = stdout.match(/port: (\d+)/)

    if (!match) {
      return { mismatch: hasSystemdOverride, actualPort: null, hasSystemdOverride }
    }

    const actualPort = Number.parseInt(match[1], 10)
    const mismatch = actualPort !== expectedPort || hasSystemdOverride

    return { mismatch, actualPort, hasSystemdOverride }
  } catch (err) {
    Sentry.captureException(err, { tags: { check: "vite-config-port" } })
    return { mismatch: false, actualPort: null, hasSystemdOverride: false }
  }
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin")

  const authError = await requireManagerAuth()
  if (authError) {
    return authError
  }

  const domains = await getAllDomains()
  const statuses: DomainStatus[] = []
  const serverIp = DEFAULTS.SERVER_IP
  if (!serverIp) {
    return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, {
      details: { reason: "SERVER_IP not configured" },
    })
  }

  const checks = domains.map(async domainInfo => {
    const domain = domainInfo.hostname
    const port = domainInfo.port

    const [
      portListening,
      httpAccessible,
      httpsAccessible,
      systemdService,
      caddyConfigured,
      siteDirectoryExists,
      dnsCheck,
      vitePortCheck,
      serveMode,
    ] = await Promise.all([
      checkPortListening(port),
      checkHttpAccessible(domain),
      checkHttpsAccessible(domain),
      checkSystemdService(domain),
      checkCaddyConfigured(domain),
      checkSiteDirectory(domain),
      checkDnsResolution(domain, serverIp),
      checkViteConfigPort(domain, port),
      checkServeMode(domain),
    ])

    return {
      domain,
      portListening,
      httpAccessible,
      httpsAccessible,
      systemdServiceExists: systemdService.exists,
      systemdServiceRunning: systemdService.running,
      caddyConfigured,
      siteDirectoryExists,
      dnsPointsToServer: dnsCheck.pointsToServer,
      dnsResolvedIp: dnsCheck.resolvedIp,
      dnsIsProxied: dnsCheck.isProxied,
      dnsVerificationMethod: dnsCheck.verificationMethod,
      vitePortMismatch: vitePortCheck.mismatch,
      viteExpectedPort: port,
      viteActualPort: vitePortCheck.actualPort,
      hasSystemdPortOverride: vitePortCheck.hasSystemdOverride,
      serveMode,
      createdAt: domainInfo.createdAt || null,
      lastChecked: Date.now(),
    }
  })

  const results = await Promise.all(checks)
  statuses.push(...results)

  return createCorsSuccessResponse(origin, { statuses })
}
