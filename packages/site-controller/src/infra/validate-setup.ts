/**
 * Validate server setup for Alive
 *
 * Checks all prerequisites before running the platform:
 * - Server config file exists and is valid
 * - Required directories exist
 * - Database connection works
 * - Environment variables are set
 *
 * Usage: bun run setup:validate
 */

import { constants } from "node:fs"
import { access, mkdir, readFile } from "node:fs/promises"
import { createClient } from "@supabase/supabase-js"
import { requireEnv } from "@webalive/shared"

// =============================================================================
// Types
// =============================================================================

interface ServerConfig {
  serverId?: string
  serverIp?: string
  paths?: {
    aliveRoot?: string
    sitesRoot?: string
    imagesStorage?: string
  }
  domains?: {
    main?: string
    wildcard?: string
    previewBase?: string
    cookieDomain?: string
    frameAncestors?: string[]
  }
  shell?: {
    domains?: string[]
    listen?: string
    upstream?: string
  }
  generated?: {
    dir?: string
    caddySites?: string
    caddyShell?: string
    nginxMap?: string
  }
}

interface CheckResult {
  name: string
  status: "pass" | "fail" | "warn" | "skip"
  message: string
  fix?: string
}

// =============================================================================
// Constants
// =============================================================================

const SERVER_CONFIG_PATH = requireEnv("SERVER_CONFIG_PATH")
const COLORS = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  dim: "\x1b[2m",
}

// =============================================================================
// Helpers
// =============================================================================

function print(msg: string) {
  process.stdout.write(`${msg}\n`)
}

function printResult(result: CheckResult) {
  const icons = {
    pass: `${COLORS.green}✓${COLORS.reset}`,
    fail: `${COLORS.red}✗${COLORS.reset}`,
    warn: `${COLORS.yellow}⚠${COLORS.reset}`,
    skip: `${COLORS.dim}○${COLORS.reset}`,
  }

  print(`${icons[result.status]} ${result.name}: ${result.message}`)

  if (result.fix && result.status !== "pass") {
    print(`  ${COLORS.dim}Fix: ${result.fix}${COLORS.reset}`)
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function dirExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK | constants.R_OK)
    return true
  } catch {
    return false
  }
}

// =============================================================================
// Checks
// =============================================================================

async function checkServerConfig(): Promise<{ result: CheckResult; config?: ServerConfig }> {
  const name = "Server Config"

  if (!(await fileExists(SERVER_CONFIG_PATH))) {
    return {
      result: {
        name,
        status: "fail",
        message: `${SERVER_CONFIG_PATH} not found`,
        fix: `Copy server-config.example.json to ${SERVER_CONFIG_PATH} and configure for this server`,
      },
    }
  }

  try {
    const raw = await readFile(SERVER_CONFIG_PATH, "utf8")
    const config = JSON.parse(raw) as ServerConfig

    const issues: string[] = []

    if (!config.serverId) issues.push("serverId is required")
    if (!config.paths?.aliveRoot) issues.push("paths.aliveRoot is required")
    if (!config.paths?.sitesRoot) issues.push("paths.sitesRoot is required")
    if (!config.generated?.dir) issues.push("generated.dir is required")

    if (issues.length > 0) {
      return {
        result: {
          name,
          status: "fail",
          message: `Invalid config: ${issues.join(", ")}`,
          fix: "Update server-config.json with required fields",
        },
        config,
      }
    }

    return {
      result: {
        name,
        status: "pass",
        message: `Valid (serverId: ${config.serverId})`,
      },
      config,
    }
  } catch (e) {
    return {
      result: {
        name,
        status: "fail",
        message: `Failed to parse: ${e instanceof Error ? e.message : "unknown error"}`,
        fix: "Ensure server-config.json is valid JSON",
      },
    }
  }
}

async function checkDirectory(name: string, path: string | undefined, create = false): Promise<CheckResult> {
  if (!path) {
    return {
      name: `Directory: ${name}`,
      status: "skip",
      message: "Path not configured",
    }
  }

  if (await dirExists(path)) {
    return {
      name: `Directory: ${name}`,
      status: "pass",
      message: path,
    }
  }

  if (create) {
    try {
      await mkdir(path, { recursive: true })
      return {
        name: `Directory: ${name}`,
        status: "pass",
        message: `${path} (created)`,
      }
    } catch (_e) {
      return {
        name: `Directory: ${name}`,
        status: "fail",
        message: `Failed to create ${path}`,
        fix: `sudo mkdir -p ${path} && sudo chown $USER:$USER ${path}`,
      }
    }
  }

  return {
    name: `Directory: ${name}`,
    status: "fail",
    message: `${path} does not exist`,
    fix: `sudo mkdir -p ${path} && sudo chown $USER:$USER ${path}`,
  }
}

function checkEnvVar(name: string, envVar: string, required: boolean): CheckResult {
  const value = process.env[envVar]

  if (value) {
    // Mask sensitive values
    const masked = value.length > 8 ? `${value.slice(0, 4)}...${value.slice(-4)}` : "****"
    return {
      name: `Env: ${name}`,
      status: "pass",
      message: masked,
    }
  }

  return {
    name: `Env: ${name}`,
    status: required ? "fail" : "warn",
    message: "Not set",
    fix: `export ${envVar}=<value> or add to .env file`,
  }
}

async function checkDatabaseConnection(): Promise<CheckResult> {
  const name = "Database Connection"

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY

  if (!url || !key) {
    return {
      name,
      status: "skip",
      message: "SUPABASE_URL or key not set",
    }
  }

  try {
    const supabase = createClient(url, key, { db: { schema: "app" } })

    // Try a simple query
    const { error } = await supabase.from("domains").select("hostname").limit(1)

    if (error) {
      return {
        name,
        status: "fail",
        message: `Query failed: ${error.message}`,
        fix: "Check Supabase credentials and database schema",
      }
    }

    return {
      name,
      status: "pass",
      message: "Connected successfully",
    }
  } catch (e) {
    return {
      name,
      status: "fail",
      message: `Connection failed: ${e instanceof Error ? e.message : "unknown"}`,
      fix: "Check SUPABASE_URL and network connectivity",
    }
  }
}

async function checkServerIdInDatabase(serverId: string | undefined): Promise<CheckResult> {
  const name = "Server ID in Database"

  if (!serverId) {
    return {
      name,
      status: "skip",
      message: "No serverId configured",
    }
  }

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY

  if (!url || !key) {
    return {
      name,
      status: "skip",
      message: "Database credentials not set",
    }
  }

  try {
    const supabase = createClient(url, key, { db: { schema: "app" } })

    // Check if server_id column exists and has our server
    const { data, error } = await supabase.from("domains").select("hostname").eq("server_id", serverId).limit(5)

    if (error) {
      if (error.message.includes("server_id")) {
        return {
          name,
          status: "fail",
          message: "server_id column missing from domains table",
          fix: "Run migration: ALTER TABLE domains ADD COLUMN server_id TEXT",
        }
      }
      return {
        name,
        status: "fail",
        message: error.message,
      }
    }

    const count = data?.length || 0
    return {
      name,
      status: "pass",
      message: `${count} domain(s) assigned to this server`,
    }
  } catch (e) {
    return {
      name,
      status: "fail",
      message: e instanceof Error ? e.message : "unknown error",
    }
  }
}

async function checkCaddyInstalled(): Promise<CheckResult> {
  const name = "Caddy Installed"

  try {
    const proc = Bun.spawn(["caddy", "version"], {
      stdout: "pipe",
      stderr: "pipe",
    })
    const output = await new Response(proc.stdout).text()
    await proc.exited

    if (proc.exitCode === 0) {
      return {
        name,
        status: "pass",
        message: output.trim().split("\n")[0],
      }
    }
  } catch {
    // Caddy not found
  }

  return {
    name,
    status: "warn",
    message: "Caddy not installed or not in PATH",
    fix: "Install Caddy: https://caddyserver.com/docs/install",
  }
}

async function checkSnippetsExist(aliveRoot: string | undefined): Promise<CheckResult> {
  const name = "Caddy Snippets"

  if (!aliveRoot) {
    return { name, status: "skip", message: "aliveRoot not configured" }
  }

  const snippets = ["common_headers.caddy", "image_serving.caddy"]
  const missing: string[] = []

  for (const snippet of snippets) {
    const path = `${aliveRoot}/ops/caddy/snippets/${snippet}`
    if (!(await fileExists(path))) {
      missing.push(snippet)
    }
  }

  if (missing.length > 0) {
    return {
      name,
      status: "fail",
      message: `Missing: ${missing.join(", ")}`,
      fix: `Ensure ${aliveRoot}/ops/caddy/snippets/ contains all snippet files`,
    }
  }

  return {
    name,
    status: "pass",
    message: `${snippets.length} snippets found`,
  }
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  print("")
  print(`${COLORS.blue}╔══════════════════════════════════════════════════════════════╗${COLORS.reset}`)
  print(`${COLORS.blue}║          Alive - Server Setup Validation                      ║${COLORS.reset}`)
  print(`${COLORS.blue}╚══════════════════════════════════════════════════════════════╝${COLORS.reset}`)
  print("")

  const results: CheckResult[] = []

  // 1. Check server config
  print(`${COLORS.dim}[1/6] Checking server configuration...${COLORS.reset}`)
  const configCheck = await checkServerConfig()
  results.push(configCheck.result)
  printResult(configCheck.result)
  const config = configCheck.config
  print("")

  // 2. Check directories
  print(`${COLORS.dim}[2/6] Checking directories...${COLORS.reset}`)
  const dirChecks = await Promise.all([
    checkDirectory("Bridge Root", config?.paths?.aliveRoot),
    checkDirectory("Sites Root", config?.paths?.sitesRoot),
    checkDirectory("Images Storage", config?.paths?.imagesStorage),
    checkDirectory("Generated Output", config?.generated?.dir, true), // Create if missing
  ])
  dirChecks.forEach(r => {
    results.push(r)
    printResult(r)
  })
  print("")

  // 3. Check environment variables
  print(`${COLORS.dim}[3/6] Checking environment variables...${COLORS.reset}`)
  const envChecks = [
    checkEnvVar("Supabase URL", "SUPABASE_URL", true),
    checkEnvVar("Supabase Key", "SUPABASE_SERVICE_ROLE_KEY", true),
    checkEnvVar("Anthropic API Key", "ANTHROPIC_API_KEY", false),
    checkEnvVar("JWT Secret", "JWT_SECRET", false),
  ]
  envChecks.forEach(r => {
    results.push(r)
    printResult(r)
  })
  print("")

  // 4. Check database connection
  print(`${COLORS.dim}[4/6] Checking database connection...${COLORS.reset}`)
  const dbCheck = await checkDatabaseConnection()
  results.push(dbCheck)
  printResult(dbCheck)

  const serverIdCheck = await checkServerIdInDatabase(config?.serverId)
  results.push(serverIdCheck)
  printResult(serverIdCheck)
  print("")

  // 5. Check Caddy
  print(`${COLORS.dim}[5/6] Checking Caddy...${COLORS.reset}`)
  const caddyCheck = await checkCaddyInstalled()
  results.push(caddyCheck)
  printResult(caddyCheck)

  const snippetsCheck = await checkSnippetsExist(config?.paths?.aliveRoot)
  results.push(snippetsCheck)
  printResult(snippetsCheck)
  print("")

  // 6. Summary
  print(`${COLORS.dim}[6/6] Summary${COLORS.reset}`)
  const passed = results.filter(r => r.status === "pass").length
  const failed = results.filter(r => r.status === "fail").length
  const warned = results.filter(r => r.status === "warn").length
  const skipped = results.filter(r => r.status === "skip").length

  print("")
  print(`  ${COLORS.green}Passed:${COLORS.reset}  ${passed}`)
  print(`  ${COLORS.red}Failed:${COLORS.reset}  ${failed}`)
  print(`  ${COLORS.yellow}Warnings:${COLORS.reset} ${warned}`)
  print(`  ${COLORS.dim}Skipped:${COLORS.reset} ${skipped}`)
  print("")

  if (failed > 0) {
    print(`${COLORS.red}Setup incomplete. Fix the issues above before proceeding.${COLORS.reset}`)
    print("")
    process.exit(1)
  } else if (warned > 0) {
    print(`${COLORS.yellow}Setup complete with warnings. Some features may not work.${COLORS.reset}`)
    print("")
    process.exit(0)
  } else {
    print(`${COLORS.green}Setup complete! Ready to run Alive.${COLORS.reset}`)
    print("")
    print("Next steps:")
    print("  1. Generate routing: bun run --cwd packages/site-controller routing:generate")
    print("  2. Start dev server: bun run dev")
    print("")
    process.exit(0)
  }
}

main().catch(e => {
  print(`${COLORS.red}Unexpected error: ${e.message}${COLORS.reset}`)
  process.exit(1)
})
