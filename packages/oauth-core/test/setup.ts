// Ensure oauth-core modules can be imported under Vitest without requiring real secrets.
// This sets process env defaults (only if not already provided).

if (!process.env.SUPABASE_URL) process.env.SUPABASE_URL = "https://test.supabase.co"

// oauth-core supports both SUPABASE_SERVICE_ROLE_KEY and SUPABASE_SERVICE_KEY.
if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SERVICE_KEY) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"
}

// 64 hex chars (32 bytes). Using all zeros is fine for unit tests.
if (!process.env.LOCKBOX_MASTER_KEY) process.env.LOCKBOX_MASTER_KEY = "0".repeat(64)
