import { execFileSync } from "node:child_process"
import { existsSync, writeFileSync } from "node:fs"
import { assertServerOnly } from "./guards.js"

// Prevent this module from being imported in browser environments
assertServerOnly("@webalive/site-controller", "Use @webalive/shared for constants")

import { DEFAULTS, getEnvFilePath, getServiceName, getSiteHome, getSiteUser, PATHS } from "@webalive/shared"
import { DeploymentError } from "./errors.js"
import { buildSite } from "./executors/build.js"
import { configureCaddy, teardown } from "./executors/caddy.js"
import { validateDns } from "./executors/dns.js"
import { setupFilesystem } from "./executors/filesystem.js"
import { assignPort } from "./executors/port.js"
import { startService } from "./executors/service.js"
import { ensureUser } from "./executors/system.js"
import type { DeployConfig, DeployResult } from "./types.js"

/**
 * Site deployment orchestrator
 * Implements the Shell-Operator Pattern with sequential execution and rollback
 */
export class SiteOrchestrator {
  private static readonly SYSTEMD_TEMPLATE_PATH = "/etc/systemd/system/site@.service"

  /**
   * Generate and install the site@.service systemd template unit.
   * Uses PATHS from server-config.json so it works on any server.
   * Only writes the file if it doesn't already exist.
   */
  private static ensureSystemdTemplate(): void {
    if (existsSync(SiteOrchestrator.SYSTEMD_TEMPLATE_PATH)) {
      return
    }

    const sitesRoot = PATHS.SITES_ROOT
    const envDir = PATHS.SYSTEMD_ENV_DIR

    if (!sitesRoot) {
      throw DeploymentError.configurationMissing("SITES_ROOT not configured — cannot generate systemd template")
    }

    const unit = `[Unit]
Description=WebAlive Site: %i
After=network.target
Wants=network.target

[Service]
Type=exec
User=site-%i
Group=site-%i
WorkingDirectory=${sitesRoot}/%i/user
EnvironmentFile=-${envDir}/%i.env
Environment=NODE_ENV=production
ExecStart=/bin/sh -c 'exec /usr/local/bin/bun run dev'

Restart=always
RestartSec=5
StartLimitInterval=300s
StartLimitBurst=10

StandardOutput=journal
StandardError=journal
SyslogIdentifier=site-%i

KillMode=mixed
KillSignal=SIGTERM
TimeoutStopSec=30

NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=${sitesRoot}/%i
MemoryDenyWriteExecute=no
ProtectKernelTunables=yes
ProtectKernelModules=yes
RestrictSUIDSGID=yes

LimitNOFILE=65536
LimitNPROC=100
MemoryMax=512M
CPUQuota=50%

CapabilityBoundingSet=
AmbientCapabilities=
UMask=0027

[Install]
WantedBy=multi-user.target
`

    console.log("[Preflight] Installing site@.service systemd template...")
    writeFileSync(SiteOrchestrator.SYSTEMD_TEMPLATE_PATH, unit, { mode: 0o644 })
    execFileSync("systemctl", ["daemon-reload"], { stdio: "pipe" })
  }

  /**
   * Verify that required system commands are available before deployment.
   * Fails fast with a clear message instead of cryptic errors mid-deployment.
   */
  private static checkSystemDependencies(): void {
    const required = ["jq", "tar", "useradd", "systemctl", "rsync"]
    const missing: string[] = []

    for (const cmd of required) {
      try {
        execFileSync("which", [cmd], { stdio: "pipe" })
      } catch {
        missing.push(cmd)
      }
    }

    if (missing.length > 0) {
      throw DeploymentError.configurationMissing(
        `Required system commands not found: ${missing.join(", ")}. Install them before deploying (e.g. apt-get install ${missing.join(" ")}).`,
      )
    }
  }

  /**
   * Deploy a site with automatic rollback on failure
   *
   * @param config - Deployment configuration
   * @returns Deployment result
   */
  static async deploy(config: DeployConfig): Promise<DeployResult> {
    const {
      domain,
      slug,
      templatePath,
      rollbackOnFailure = true,
      skipBuild = false,
      skipCaddy = false,
      serverIp,
      wildcardDomain,
    } = config

    // Preflight: verify system dependencies and systemd template
    SiteOrchestrator.checkSystemDependencies()
    SiteOrchestrator.ensureSystemdTemplate()

    // Require serverIp and wildcardDomain - no fallbacks
    if (!serverIp) {
      throw DeploymentError.configurationMissing("serverIp is required")
    }
    if (!wildcardDomain) {
      throw DeploymentError.configurationMissing("wildcardDomain is required")
    }

    // Validate domain format to prevent path traversal
    if (!/^[a-z0-9.-]+$/i.test(domain)) {
      throw DeploymentError.invalidDomain(domain)
    }
    if (domain.includes("..") || domain.startsWith("/")) {
      throw DeploymentError.pathTraversal(domain)
    }

    const serviceName = getServiceName(slug)
    let deployedPort: number | undefined

    console.log(`\n=== Starting deployment for ${domain} ===\n`)

    try {
      // Phase 1: DNS Validation
      console.log("[Phase 1/7] Validating DNS...")
      const dnsResult = await validateDns({ domain, serverIp, wildcardDomain })
      if (!dnsResult.valid) {
        throw DeploymentError.dnsValidationFailed(dnsResult.message || "DNS does not point to server")
      }
      console.log("✓ DNS validation passed\n")

      // Phase 2: Port Assignment
      console.log("[Phase 2/7] Assigning port...")
      const portResult = await assignPort({
        domain,
        registryPath: PATHS.REGISTRY_PATH,
      })
      deployedPort = portResult.port
      console.log(`✓ Port assigned: ${deployedPort}${portResult.isNew ? " (new)" : " (existing)"}\n`)

      // Phase 3: User Creation
      console.log("[Phase 3/7] Ensuring system user...")
      const siteUser = getSiteUser(slug)
      const siteHome = getSiteHome(domain)
      await ensureUser({ user: siteUser, home: siteHome })
      console.log(`✓ User ready: ${siteUser}\n`)

      // Phase 4: Filesystem Setup
      console.log("[Phase 4/7] Setting up filesystem...")
      await setupFilesystem({
        user: siteUser,
        domain,
        targetDir: siteHome,
        templatePath,
      })
      console.log(`✓ Filesystem ready: ${siteHome}\n`)

      // Phase 5: Build Site
      if (!skipBuild) {
        console.log("[Phase 5/7] Building site...")
        await buildSite({
          user: siteUser,
          domain,
          port: deployedPort,
          slug,
          targetDir: siteHome,
          envFilePath: getEnvFilePath(slug),
        })
        console.log("✓ Site built successfully\n")
      } else {
        console.log("[Phase 5/7] Skipping build (raw import)\n")
      }

      // Phase 6: Start Service
      if (!skipBuild) {
        console.log("[Phase 6/7] Starting systemd service...")
        await startService({
          slug,
          port: deployedPort,
          domain,
          serviceName,
        })
        console.log(`✓ Service started: ${serviceName}\n`)
      } else {
        console.log("[Phase 6/7] Skipping service start (raw import — user starts after setup)\n")
      }

      // Phase 7: Configure Caddy
      if (!skipCaddy) {
        console.log("[Phase 7/7] Configuring Caddy...")
        await configureCaddy({
          domain,
          port: deployedPort,
          caddyfilePath: PATHS.CADDYFILE_PATH,
          caddyLockPath: PATHS.CADDY_LOCK,
          flockTimeout: DEFAULTS.FLOCK_TIMEOUT,
        })
        console.log("✓ Caddy configured\n")
      } else {
        console.log("[Phase 7/7] Skipping Caddy configuration (caller will handle)\n")
      }

      console.log(`\n=== Deployment successful: ${domain} ===`)
      console.log(`Site URL: https://${domain}`)
      console.log(`Port: ${deployedPort}`)
      console.log(`Service: ${serviceName}\n`)

      return {
        domain,
        port: deployedPort,
        serviceName,
        success: true,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error(`\n✗ Deployment failed: ${errorMessage}\n`)

      // Determine which phase failed from typed error code
      let failedPhase = "unknown"
      if (error instanceof DeploymentError) {
        const codeToPhase: Record<string, string> = {
          DNS_VALIDATION_FAILED: "dns",
          INVALID_DOMAIN: "validation",
          PATH_TRAVERSAL: "validation",
          SITE_EXISTS: "validation",
          PORT_ASSIGNMENT_FAILED: "port",
          USER_CREATION_FAILED: "user",
          FILESYSTEM_ERROR: "filesystem",
          BUILD_FAILED: "build",
          SERVICE_START_FAILED: "service",
          CADDY_CONFIG_FAILED: "caddy",
        }
        failedPhase = codeToPhase[error.code] || "unknown"
      }

      // Attempt rollback if enabled - full cleanup so retry works
      if (rollbackOnFailure && deployedPort) {
        console.log("\n=== Attempting rollback (full cleanup) ===\n")
        try {
          await SiteOrchestrator.teardown(domain, {
            removeFiles: true,
            removeUser: true,
            removePort: true,
          })
          console.log("✓ Rollback successful - site fully cleaned up\n")
        } catch (rollbackError) {
          console.error(
            `✗ Rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}\n`,
          )
        }
      }

      // Re-throw typed errors, wrap others
      if (error instanceof DeploymentError) {
        throw error
      }

      return {
        domain,
        port: deployedPort || 0,
        serviceName,
        success: false,
        error: errorMessage,
        failedPhase,
      }
    }
  }

  /**
   * Teardown a deployed site
   *
   * @param domain - Domain to teardown
   * @param options - Teardown options
   */
  static async teardown(
    domain: string,
    options: {
      removeUser?: boolean
      removeFiles?: boolean
      removePort?: boolean
    } = {},
  ): Promise<void> {
    const slug = domain.replace(/\./g, "-")
    const serviceName = getServiceName(slug)

    console.log(`\n=== Tearing down ${domain} ===\n`)

    await teardown({
      domain,
      slug,
      serviceName,
      removeUser: options.removeUser,
      removeFiles: options.removeFiles,
      removePort: options.removePort,
      caddyfilePath: PATHS.CADDYFILE_PATH,
      caddyLockPath: PATHS.CADDY_LOCK,
      envFilePath: getEnvFilePath(slug),
      registryPath: PATHS.REGISTRY_PATH,
    })

    console.log(`\n=== Teardown complete: ${domain} ===\n`)
  }
}
