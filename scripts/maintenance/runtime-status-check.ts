#!/usr/bin/env bun

import { mkdirSync, statfsSync, unlinkSync, writeFileSync } from "node:fs"
import path from "node:path"

type Environment = "production" | "staging" | "dev"

type CheckResult = {
  name: string
  ok: boolean
  details: string
}

interface Options {
  envs: Environment[]
  timeoutMs: number
  minFreeGb: number
  minFreePercent: number
  claudeRuntimeDir: string
}

const ENV_PORTS: Record<Environment, number> = {
  production: 9000,
  staging: 8998,
  dev: 8997,
}

const DEFAULT_OPTS: Options = {
  envs: ["production"],
  timeoutMs: 8000,
  minFreeGb: 15,
  minFreePercent: 10,
  claudeRuntimeDir: "/root/.claude",
}

function usage(): void {
  console.log(`Usage: bun scripts/maintenance/runtime-status-check.ts [options]

Checks:
  - Root disk free space threshold
  - Claude runtime directory write test
  - /api/health endpoint status for selected environments

Options:
  --env <production|staging|dev>    Environment to check (repeatable, default: production)
  --timeout-ms <n>                  HTTP timeout in ms (default: 8000)
  --min-free-gb <n>                 Minimum free disk GB (default: 15)
  --min-free-percent <n>            Minimum free disk percent (default: 10)
  --claude-runtime-dir <path>       Claude runtime directory to write-test (default: /root/.claude)
  --help                            Show help
`)
}

function parseNumberArg(argName: string, value: string | undefined): number {
  if (!value) {
    throw new Error(`${argName} requires a value`)
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${argName} must be a positive number`)
  }

  return parsed
}

function parseArgs(argv: string[]): Options {
  const options: Options = { ...DEFAULT_OPTS, envs: [...DEFAULT_OPTS.envs] }
  const selectedEnvs: Environment[] = []

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    if (arg === "--help" || arg === "-h") {
      usage()
      process.exit(0)
    }

    if (arg === "--env") {
      const value = argv[++i]
      if (!value) {
        throw new Error("--env requires a value")
      }
      if (!(value in ENV_PORTS)) {
        throw new Error(`Invalid --env '${value}'. Valid values: production, staging, dev`)
      }
      selectedEnvs.push(value as Environment)
      continue
    }

    if (arg === "--timeout-ms") {
      options.timeoutMs = parseNumberArg("--timeout-ms", argv[++i])
      continue
    }

    if (arg === "--min-free-gb") {
      options.minFreeGb = parseNumberArg("--min-free-gb", argv[++i])
      continue
    }

    if (arg === "--min-free-percent") {
      options.minFreePercent = parseNumberArg("--min-free-percent", argv[++i])
      continue
    }

    if (arg === "--claude-runtime-dir") {
      const value = argv[++i]
      if (!value) {
        throw new Error("--claude-runtime-dir requires a value")
      }
      options.claudeRuntimeDir = value
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  if (selectedEnvs.length > 0) {
    options.envs = selectedEnvs
  }

  return options
}

function bytesToGiB(bytes: number): number {
  return bytes / (1024 * 1024 * 1024)
}

function checkDisk(minFreeGb: number, minFreePercent: number): CheckResult {
  try {
    const fsStats = statfsSync("/")
    const freeBytes = fsStats.bavail * fsStats.bsize
    const totalBytes = fsStats.blocks * fsStats.bsize
    const freeGb = bytesToGiB(freeBytes)
    const freePercent = totalBytes > 0 ? (freeBytes / totalBytes) * 100 : 0

    // Avoid false positives on large disks:
    // either absolute free space OR free percentage can satisfy the threshold.
    const ok = freeGb >= minFreeGb || freePercent >= minFreePercent
    return {
      name: "disk:/",
      ok,
      details: `free=${freeGb.toFixed(1)}GiB (${freePercent.toFixed(1)}%), threshold=${minFreeGb}GiB/${minFreePercent}%`,
    }
  } catch (error) {
    return {
      name: "disk:/",
      ok: false,
      details: error instanceof Error ? error.message : String(error),
    }
  }
}

function checkClaudeRuntimeWrite(claudeRuntimeDir: string): CheckResult {
  try {
    mkdirSync(claudeRuntimeDir, { recursive: true })
    const probePath = path.join(claudeRuntimeDir, `.alive-health-probe-${process.pid}-${Date.now()}.tmp`)
    writeFileSync(probePath, "ok", { encoding: "utf8" })
    unlinkSync(probePath)

    return {
      name: "claude-runtime:write",
      ok: true,
      details: `write test passed (${claudeRuntimeDir})`,
    }
  } catch (error) {
    return {
      name: "claude-runtime:write",
      ok: false,
      details: error instanceof Error ? error.message : String(error),
    }
  }
}

function extractServiceStatus(payload: unknown, service: "redis" | "database"): string {
  if (typeof payload !== "object" || payload === null) {
    return "unknown"
  }

  const services = (payload as { services?: unknown }).services
  if (typeof services !== "object" || services === null) {
    return "unknown"
  }

  const serviceData = (services as Record<string, unknown>)[service]
  if (typeof serviceData !== "object" || serviceData === null) {
    return "unknown"
  }

  const status = (serviceData as { status?: unknown }).status
  return typeof status === "string" ? status : "unknown"
}

async function checkApiHealth(env: Environment, timeoutMs: number): Promise<CheckResult> {
  const port = ENV_PORTS[env]
  const url = `http://127.0.0.1:${port}/api/health`

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })

    if (!response.ok) {
      return {
        name: `api-health:${env}`,
        ok: false,
        details: `HTTP ${response.status} from ${url}`,
      }
    }

    const payload = await response.json()
    const status = typeof payload?.status === "string" ? payload.status : "unknown"
    const redisStatus = extractServiceStatus(payload, "redis")
    const dbStatus = extractServiceStatus(payload, "database")

    const ok = status === "healthy" && redisStatus === "connected" && dbStatus === "connected"

    return {
      name: `api-health:${env}`,
      ok,
      details: `status=${status}, redis=${redisStatus}, database=${dbStatus}, url=${url}`,
    }
  } catch (error) {
    return {
      name: `api-health:${env}`,
      ok: false,
      details: error instanceof Error ? error.message : String(error),
    }
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))

  const checkResults: CheckResult[] = []
  checkResults.push(checkDisk(options.minFreeGb, options.minFreePercent))
  checkResults.push(checkClaudeRuntimeWrite(options.claudeRuntimeDir))

  const apiChecks = await Promise.all(options.envs.map(env => checkApiHealth(env, options.timeoutMs)))
  checkResults.push(...apiChecks)

  const failed = checkResults.filter(result => !result.ok)

  console.log(`[alive-runtime-status] checked at ${new Date().toISOString()}`)
  for (const result of checkResults) {
    const prefix = result.ok ? "OK" : "FAIL"
    console.log(`[alive-runtime-status] ${prefix} ${result.name} - ${result.details}`)
  }

  if (failed.length > 0) {
    console.error(`[alive-runtime-status] overall=unhealthy failed_checks=${failed.length}`)
    process.exit(1)
  }

  console.log("[alive-runtime-status] overall=healthy")
}

try {
  await main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[alive-runtime-status] fatal=${message}`)
  process.exit(1)
}
