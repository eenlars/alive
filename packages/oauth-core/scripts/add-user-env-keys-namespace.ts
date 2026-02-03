#!/usr/bin/env bun
/**
 * Migration: Add user_env_keys namespace to lockbox.user_secrets
 *
 * This migration updates the CHECK constraint on the namespace column
 * to allow 'user_env_keys' for storing user-defined environment variables.
 *
 * Run: bun run packages/oauth-core/scripts/add-user-env-keys-namespace.ts
 */

const SUPABASE_PROJECT_ID = process.env.SUPABASE_PROJECT_ID
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN

if (!SUPABASE_PROJECT_ID || !SUPABASE_ACCESS_TOKEN) {
  console.error("❌ Missing required environment variables:")
  console.error("   - SUPABASE_PROJECT_ID")
  console.error("   - SUPABASE_ACCESS_TOKEN")
  console.error("\nGet these from: https://supabase.com/dashboard/project/_/settings/api")
  process.exit(1)
}

async function executeSql(query: string) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_ID}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`SQL query failed: ${JSON.stringify(error, null, 2)}`)
  }

  return response.json()
}

async function migrate() {
  console.log("🔐 Migration: Add user_env_keys namespace\n")
  console.log("=====================================\n")

  try {
    // 1. Drop the existing CHECK constraint
    console.log("1️⃣  Dropping existing namespace CHECK constraint...")

    // First, find the constraint name
    const constraintResult = await executeSql(`
      SELECT constraint_name
      FROM information_schema.check_constraints
      WHERE constraint_schema = 'lockbox'
        AND constraint_name LIKE '%namespace%'
    `)

    if (constraintResult && Array.isArray(constraintResult) && constraintResult.length > 0) {
      const constraintName = constraintResult[0].constraint_name
      console.log(`   Found constraint: ${constraintName}`)
      await executeSql(`
        ALTER TABLE lockbox.user_secrets
        DROP CONSTRAINT IF EXISTS "${constraintName}"
      `)
      console.log("✅ Constraint dropped\n")
    } else {
      // Try to drop by common naming patterns
      console.log("   No named constraint found, trying common patterns...")
      await executeSql(`
        ALTER TABLE lockbox.user_secrets
        DROP CONSTRAINT IF EXISTS user_secrets_namespace_check
      `)
      console.log("✅ Constraint dropped (or did not exist)\n")
    }

    // 2. Add new CHECK constraint with user_env_keys
    console.log("2️⃣  Adding new namespace CHECK constraint...")
    await executeSql(`
      ALTER TABLE lockbox.user_secrets
      ADD CONSTRAINT user_secrets_namespace_check
      CHECK (namespace IN ('provider_config', 'oauth_tokens', 'oauth_connections', 'user_env_keys'))
    `)
    console.log("✅ New constraint added\n")

    // 3. Update column comment
    console.log("3️⃣  Updating column documentation...")
    await executeSql(`
      COMMENT ON COLUMN lockbox.user_secrets.namespace IS
        'Type of secret: provider_config (tenant OAuth app), oauth_connections (user OAuth tokens), user_env_keys (user custom API keys)'
    `)
    console.log("✅ Documentation updated\n")

    // Success
    console.log("=====================================")
    console.log("🎉 MIGRATION COMPLETE! 🎉")
    console.log("=====================================\n")

    console.log("The user_env_keys namespace is now available.")
    console.log("Users can store custom API keys like OPENAI_API_KEY, etc.\n")
  } catch (error) {
    console.error("\n❌ MIGRATION FAILED\n")
    console.error("Error:", error instanceof Error ? error.message : error)
    console.error("\nStack trace:", error instanceof Error ? error.stack : "")
    process.exit(1)
  }
}

// Run migration
migrate()
