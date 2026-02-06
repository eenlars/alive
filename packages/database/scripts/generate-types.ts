#!/usr/bin/env bun
/**
 * Generate database schema types from Supabase
 *
 * This script generates TypeScript types for all database schemas.
 * Run manually when the database schema changes: `bun run gen:types`
 *
 * Prerequisites:
 * - Supabase CLI installed (`bun x supabase` or `npm i -g supabase`)
 * - SUPABASE_PROJECT_ID env var or use default
 *
 * Note: Generated files are committed to git. Do NOT include timestamps
 * to avoid unnecessary diffs when types haven't actually changed.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve, dirname } from "node:path"

// Load environment variables from apps/web/.env
const scriptDir = dirname(new URL(import.meta.url).pathname)
const envPath = resolve(scriptDir, "../../../apps/web/.env")
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, "utf-8")
  envContent.split("\n").forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const value = match[2].trim().replace(/^["']|["']$/g, "")
      if (!process.env[key]) {
        process.env[key] = value
      }
    }
  })
}

// Require SUPABASE_PROJECT_ID to be explicitly set - no fallback to prevent wrong DB types
const projectId = process.env.SUPABASE_PROJECT_ID
if (!projectId) {
  console.error("❌ Error: SUPABASE_PROJECT_ID environment variable is required")
  console.error("")
  console.error("Please set SUPABASE_PROJECT_ID in your .env file or environment:")
  console.error("  export SUPABASE_PROJECT_ID=your_project_id")
  console.error("")
  console.error("This prevents accidentally generating types from the wrong database.")
  process.exit(1)
}

const supabaseCliPath = (() => {
  try {
    return typeof Bun !== "undefined" && typeof Bun.which === "function" ? (Bun.which("supabase") ?? null) : null
  } catch {
    return null
  }
})()

const outputDir = resolve(scriptDir, "../src")
const tempDir = resolve(scriptDir, "../.tmp")

async function generateTypes() {
  console.log("Generating database schema types...")
  console.log(`Project ID: ${projectId}`)

  // Ensure temp directory exists
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true })
  }

  try {
    // Generate types for all schemas
    const schemas = ["lockbox", "integrations", "iam", "public", "app"]
    const generatedSchemas: string[] = []

    for (const schema of schemas) {
      console.log(`  Generating types for ${schema} schema...`)

      // Use either installed CLI or bun x to run latest version
      const baseArgs = ["gen", "types", "typescript", "--project-id", projectId, "--schema", schema]
      const command = supabaseCliPath ?? "bun"
      const args = supabaseCliPath ? baseArgs : ["x", "supabase@latest", ...baseArgs]

      const proc = Bun.spawn([command, ...args], {
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          TMPDIR: tempDir,
          TEMP: tempDir,
          TMP: tempDir,
          BUN_INSTALL_CACHE: tempDir,
          BUN_INSTALL_TMPDIR: tempDir,
          XDG_CACHE_HOME: tempDir,
        },
      })

      const stdout = await new Response(proc.stdout).text()
      const stderr = proc.stderr ? await new Response(proc.stderr).text() : ""
      const exitCode = await proc.exited

      if (exitCode !== 0) {
        // If schema doesn't exist, continue with others
        if (stderr.includes("does not exist")) {
          console.log(`  Note: ${schema} schema not found in database, skipping...`)
          continue
        }
        console.error(`Failed to generate types for ${schema} schema:`)
        console.error(stderr.trim() || stdout.trim())
        process.exit(1)
      }

      // Post-process: Fix DefaultSchema to use the actual schema name
      // Supabase CLI always generates with "public" but schema-specific files need their own schema
      let processedOutput = stdout
      if (schema !== "public") {
        processedOutput = processedOutput.replace(
          /type DefaultSchema = DatabaseWithoutInternals\[Extract<keyof Database, "public">\]/g,
          `type DefaultSchema = DatabaseWithoutInternals["${schema}"]`,
        )
      }

      // Write to individual generated file (NO TIMESTAMP to avoid noisy diffs)
      const generatedFilePath = resolve(outputDir, `${schema}.generated.ts`)
      const fileContent = `// Auto-generated ${schema} schema types
// Generated from Supabase database
// DO NOT EDIT MANUALLY - Run 'bun run gen:types' to regenerate
//
// Schema: ${schema}
// Project: ${projectId}

${processedOutput}
`

      writeFileSync(generatedFilePath, fileContent)
      generatedSchemas.push(schema)
      console.log(`  Written: src/${schema}.generated.ts`)
    }

    // Create the main index.ts file that imports and re-exports
    // (NO TIMESTAMP to avoid noisy diffs)
    const mainTypesContent = `// Main database types file
// Imports and re-exports generated schema types
// DO NOT EDIT MANUALLY - Run 'bun run gen:types' to regenerate

// Export common types from public schema (if available) or lockbox as fallback
${
  generatedSchemas.includes("public")
    ? `export {
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
  Enums,
  CompositeTypes,
} from "./public.generated"`
    : generatedSchemas.includes("lockbox")
      ? `export {
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
  Enums,
  CompositeTypes,
} from "./lockbox.generated"`
      : "// No common types to export"
}

// Import Database types for renaming
${generatedSchemas
  .map(schema => {
    const capitalized = schema.charAt(0).toUpperCase() + schema.slice(1)
    return `import type { Database as ${capitalized}Database } from "./${schema}.generated"`
  })
  .join("\n")}

// Re-export with schema-specific names
${generatedSchemas
  .map(schema => {
    const capitalized = schema.charAt(0).toUpperCase() + schema.slice(1)
    return `export type { ${capitalized}Database }`
  })
  .join("\n")}

// Re-export the main Database type for backward compatibility
${
  generatedSchemas.includes("public") || generatedSchemas.includes("lockbox")
    ? `export type Database = ${generatedSchemas.includes("public") ? "PublicDatabase" : "LockboxDatabase"}`
    : `// ERROR: No usable database schema found (expected 'public' or 'lockbox')
// This is a configuration error - check your database setup
export type Database = never`
}

// Export database client creators
export * from "./client"
`

    const mainTypesPath = resolve(outputDir, "index.ts")
    writeFileSync(mainTypesPath, mainTypesContent)

    console.log("\nTypes generated successfully!")
    console.log(`Schemas included: ${generatedSchemas.join(", ")}`)
    console.log("\nGenerated files:")
    generatedSchemas.forEach(schema => {
      console.log(`  - src/${schema}.generated.ts`)
    })
    console.log("  - src/index.ts")
  } catch (error) {
    console.error("Type generation failed:")
    console.error(error)
    process.exit(1)
  }
}

generateTypes()
