#!/usr/bin/env bun

import { lstatSync, readdirSync, readlinkSync, rmSync, statSync } from "node:fs"
import path from "node:path"

type BuildEnv = "production" | "staging"

const VALID_ENVS: ReadonlySet<string> = new Set(["production", "staging"])
const DEFAULT_DAYS = 7

function isValidEnv(value: string): value is BuildEnv {
  return VALID_ENVS.has(value)
}


interface Options {
  root: string
  days: number
  dryRun: boolean
  envs: BuildEnv[]
}

function printUsage(): void {
  console.log(`
Usage: bun scripts/deployment/prune-old-builds.ts [options]

Options:
  --days <n>      Delete builds older than <n> days (default: 7)
  --env <name>    Environment to prune (production|staging). Repeatable.
  --root <path>   Project root path (default: repo root)
  --dry-run       Show what would be deleted without deleting
  --help          Show this help
`)
}

function parseTimestampFromBuildName(name: string): number | null {
  // server-setup.ts creates builds as ISO timestamps: "2026-02-17T13-33-23"
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})$/.exec(name)
  if (!match) {
    return null
  }

  const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr] = match
  const timestamp = Date.UTC(
    Number(yearStr),
    Number(monthStr) - 1,
    Number(dayStr),
    Number(hourStr),
    Number(minuteStr),
    Number(secondStr),
  )
  return Number.isFinite(timestamp) ? timestamp : null
}

function parseArgs(argv: string[]): Options {
  const defaultRoot = path.resolve(import.meta.dir, "../..")
  const parsedEnvs: BuildEnv[] = []

  let root = defaultRoot
  let days = DEFAULT_DAYS
  let dryRun = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    if (arg === "--help" || arg === "-h") {
      printUsage()
      process.exit(0)
    }

    if (arg === "--dry-run") {
      dryRun = true
      continue
    }

    if (arg === "--days") {
      const value = argv[++i]
      if (!value) {
        throw new Error("--days requires a value")
      }
      const parsed = Number(value)
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error("--days must be a positive integer")
      }
      days = parsed
      continue
    }

    if (arg === "--env") {
      const value = argv[++i]
      if (!value) {
        throw new Error("--env requires a value")
      }
      if (!isValidEnv(value)) {
        throw new Error(`Invalid --env '${value}'. Valid values: production, staging`)
      }
      parsedEnvs.push(value)
      continue
    }

    if (arg === "--root") {
      const value = argv[++i]
      if (!value) {
        throw new Error("--root requires a value")
      }
      root = path.resolve(value)
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return {
    root,
    days,
    dryRun,
    envs: parsedEnvs.length > 0 ? parsedEnvs : [...VALID_ENVS],
  }
}

function resolveCurrentBuild(envBuildDir: string): string | null {
  try {
    const currentLink = path.join(envBuildDir, "current")
    const linkedPath = readlinkSync(currentLink)
    return path.basename(linkedPath)
  } catch {
    return null
  }
}

function isDirectory(pathname: string): boolean {
  try {
    return lstatSync(pathname).isDirectory()
  } catch {
    return false
  }
}

function pruneEnvironmentBuilds(options: Options, env: BuildEnv, cutoffTs: number): { scanned: number; deleted: number } {
  const envBuildDir = path.join(options.root, ".builds", env)
  if (!isDirectory(envBuildDir)) {
    console.log(`[prune-old-builds] ${env}: skipped (missing directory: ${envBuildDir})`)
    return { scanned: 0, deleted: 0 }
  }

  const currentBuild = resolveCurrentBuild(envBuildDir)
  const entries = readdirSync(envBuildDir)
  let scanned = 0
  let deleted = 0

  for (const entry of entries) {
    // Build dirs are ISO timestamps: "2026-02-17T13-33-23" (from server-setup.ts)
    // Skip non-build entries (e.g. "current" symlink)
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/.test(entry)) {
      continue
    }

    const fullPath = path.join(envBuildDir, entry)
    if (!isDirectory(fullPath)) {
      continue
    }
    if (entry === currentBuild) {
      continue
    }

    scanned += 1

    const parsedTimestamp = parseTimestampFromBuildName(entry)
    const createdAt = parsedTimestamp ?? statSync(fullPath).mtimeMs
    if (createdAt >= cutoffTs) {
      continue
    }

    if (options.dryRun) {
      console.log(`[prune-old-builds] ${env}: would delete ${entry}`)
      continue
    }

    rmSync(fullPath, { recursive: true, force: true })
    deleted += 1
    console.log(`[prune-old-builds] ${env}: deleted ${entry}`)
  }

  return { scanned, deleted }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2))
  const cutoffTs = Date.now() - options.days * 24 * 60 * 60 * 1000

  console.log(
    `[prune-old-builds] root=${options.root} envs=${options.envs.join(",")} days=${options.days} dryRun=${options.dryRun}`,
  )

  let totalScanned = 0
  let totalDeleted = 0
  for (const env of options.envs) {
    const result = pruneEnvironmentBuilds(options, env, cutoffTs)
    totalScanned += result.scanned
    totalDeleted += result.deleted
  }

  console.log(`[prune-old-builds] done: scanned=${totalScanned} deleted=${totalDeleted}`)
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[prune-old-builds] failed: ${message}`)
  process.exit(1)
}

