#!/usr/bin/env bun
/**
 * Lockbox Schema Setup - Programmatic Version
 *
 * Creates the lockbox schema and user_secrets table in Supabase
 * Uses Supabase Management API to execute DDL
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

async function setupSchema() {
  console.log("🔐 Setting up Lockbox Schema\n")
  console.log("=====================================\n")

  try {
    // 1. Create lockbox schema
    console.log("1️⃣  Creating lockbox schema...")
    await executeSql("CREATE SCHEMA IF NOT EXISTS lockbox")
    console.log("✅ Schema created\n")

    // 2. Create user_secrets table
    console.log("2️⃣  Creating user_secrets table...")
    await executeSql(`
      CREATE TABLE IF NOT EXISTS lockbox.user_secrets (
        secret_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        clerk_id UUID NOT NULL REFERENCES iam.users(user_id) ON DELETE CASCADE,
        namespace VARCHAR(50) NOT NULL CHECK (namespace IN ('provider_config', 'oauth_tokens')),
        name VARCHAR(100) NOT NULL,
        ciphertext BYTEA NOT NULL,
        iv BYTEA NOT NULL CHECK (octet_length(iv) = 12),
        auth_tag BYTEA NOT NULL CHECK (octet_length(auth_tag) = 16),
        version INTEGER NOT NULL DEFAULT 1,
        is_current BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT unique_current_secret UNIQUE (clerk_id, namespace, name, is_current)
      )
    `)
    console.log("✅ Table created\n")

    // 3. Create index
    console.log("3️⃣  Creating indexes...")
    await executeSql(`
      CREATE INDEX IF NOT EXISTS idx_user_secrets_lookup
        ON lockbox.user_secrets(clerk_id, namespace, name, is_current)
    `)
    console.log("✅ Indexes created\n")

    // 4. Enable RLS
    console.log("4️⃣  Enabling Row Level Security...")
    await executeSql("ALTER TABLE lockbox.user_secrets ENABLE ROW LEVEL SECURITY")
    console.log("✅ RLS enabled\n")

    // 5. Create RLS policy
    console.log("5️⃣  Creating RLS policies...")
    await executeSql(`
      DROP POLICY IF EXISTS "Users can read own secrets" ON lockbox.user_secrets
    `)
    await executeSql(`
      CREATE POLICY "Users can read own secrets"
        ON lockbox.user_secrets FOR SELECT
        USING (clerk_id = auth.uid())
    `)
    console.log("✅ Policies created\n")

    // 6. Create updated_at trigger
    console.log("6️⃣  Creating triggers...")
    await executeSql(`
      CREATE OR REPLACE FUNCTION lockbox.update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `)

    await executeSql(`
      DROP TRIGGER IF EXISTS update_user_secrets_updated_at ON lockbox.user_secrets
    `)

    await executeSql(`
      CREATE TRIGGER update_user_secrets_updated_at
        BEFORE UPDATE ON lockbox.user_secrets
        FOR EACH ROW
        EXECUTE FUNCTION lockbox.update_updated_at_column()
    `)
    console.log("✅ Triggers created\n")

    // 7. Grant permissions
    console.log("7️⃣  Granting permissions...")
    await executeSql("GRANT USAGE ON SCHEMA lockbox TO service_role")
    await executeSql("GRANT ALL ON lockbox.user_secrets TO service_role")
    await executeSql("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA lockbox TO service_role")
    console.log("✅ Permissions granted\n")

    // 8. Add comments
    console.log("8️⃣  Adding documentation...")
    await executeSql("COMMENT ON TABLE lockbox.user_secrets IS 'Encrypted OAuth secrets using AES-256-GCM'")
    await executeSql(
      "COMMENT ON COLUMN lockbox.user_secrets.namespace IS 'Type of secret: provider_config (tenant) or oauth_tokens (user)'",
    )
    await executeSql("COMMENT ON COLUMN lockbox.user_secrets.iv IS 'Initialization vector for AES-256-GCM (12 bytes)'")
    await executeSql("COMMENT ON COLUMN lockbox.user_secrets.auth_tag IS 'Authentication tag for AEAD (16 bytes)'")
    await executeSql(
      "COMMENT ON COLUMN lockbox.user_secrets.is_current IS 'Used for key rotation - only one version can be current'",
    )
    console.log("✅ Documentation added\n")

    // Success
    console.log("=====================================")
    console.log("🎉 LOCKBOX SCHEMA SETUP COMPLETE! 🎉")
    console.log("=====================================\n")

    console.log("Next steps:")
    console.log("1. Set LOCKBOX_MASTER_KEY: openssl rand -hex 32")
    console.log("2. Run: bun run verify")
    console.log("3. Integrate with apps/web\n")
  } catch (error) {
    console.error("\n❌ SCHEMA SETUP FAILED\n")
    console.error("Error:", error instanceof Error ? error.message : error)
    console.error("\nStack trace:", error instanceof Error ? error.stack : "")
    process.exit(1)
  }
}

// Run setup
setupSchema()
