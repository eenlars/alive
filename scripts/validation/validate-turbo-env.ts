#!/usr/bin/env bun
/**
 * Validates that all NEXT_PUBLIC_* env vars from @webalive/env schema
 * are listed in turbo.json's build.env array.
 *
 * Run: bun scripts/validation/validate-turbo-env.ts
 * Exit: 0 if valid, 1 if missing vars
 *
 * This prevents the silent failure that occurs when a client env var is
 * defined in schema.ts but not in turbo.json - the var won't be baked
 * into the client bundle during build.
 *
 * NOTE: Parses keys directly from schema.ts to avoid importing Zod/env
 * package, which can hang under high system load during pre-push hooks.
 */

import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, "../..")

// Parse client env keys directly from schema.ts by finding the clientSchema object
const schemaPath = resolve(ROOT, "packages/env/src/schema.ts")
const schemaSource = readFileSync(schemaPath, "utf-8")

// Extract keys from `export const clientSchema = { KEY: ... }` block
const clientSchemaMatch = schemaSource.match(/export const clientSchema\s*=\s*\{([^}]+)\}/)
if (!clientSchemaMatch) {
  console.error("❌ Could not find clientSchema in packages/env/src/schema.ts")
  process.exit(1)
}

const clientKeys = [...clientSchemaMatch[1].matchAll(/^\s*(NEXT_PUBLIC_\w+)\s*:/gm)].map(m => m[1])

if (clientKeys.length === 0) {
  console.error("❌ No NEXT_PUBLIC_* keys found in clientSchema")
  process.exit(1)
}

// Read turbo.json
const turboPath = resolve(ROOT, "turbo.json")
const turboConfig = JSON.parse(readFileSync(turboPath, "utf-8"))

// Get build.env array from turbo.json
const turboBuildEnv: string[] = turboConfig.tasks?.build?.env ?? []

// Find missing client env vars
const missing = clientKeys.filter((v) => !turboBuildEnv.includes(v))

if (missing.length > 0) {
  console.error("❌ Missing from turbo.json tasks.build.env:")
  for (const v of missing) {
    console.error(`   - ${v}`)
  }
  console.error("")
  console.error("These NEXT_PUBLIC_* vars are defined in @webalive/env schema")
  console.error("but not in turbo.json, so they won't be baked into the client bundle.")
  console.error("")
  console.error("Fix: Add them to turbo.json tasks.build.env array")
  process.exit(1)
}

console.log("✓ All client env vars present in turbo.json build.env")
