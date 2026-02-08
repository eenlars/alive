/**
 * Env vars that must NEVER be passed to workspace subprocesses.
 *
 * Defense-in-depth: The outer sandbox (agent-child-runner.ts) already
 * strips these via an allowlist. This denylist catches them if the outer
 * layer is misconfigured or bypassed.
 */
const DENIED_ENV_KEYS = new Set([
  // Database
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_KEY",
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_PROJECT_ID",
  "DATABASE_URL",
  "DATABASE_PASSWORD",
  // Auth & encryption
  "JWT_SECRET",
  "LOCKBOX_MASTER_KEY",
  // Redis
  "REDIS_URL",
  // Third-party secrets
  "ANTHROPIC_API_KEY",
  "ANTH_API_SECRET",
  "GROQ_API_SECRET",
  "STRIPE_OAUTH_TOKEN",
  "LINEAR_CLIENT_SECRET",
  "GOOGLE_CLIENT_SECRET",
  "FLOWGLAD_SECRET_KEY",
  // Internal
  "SHELL_PASSWORD",
  "E2E_TEST_SECRET",
  "INTERNAL_WEBHOOK_SECRET",
])

/**
 * Sanitize environment variables for subprocess execution after privilege drop.
 *
 * Two layers of protection:
 *  1. OUTER (agent-child-runner.ts): Allowlist — only passes safe vars to agent process
 *  2. INNER (this function): Denylist — strips known secrets as defense-in-depth
 *
 * Also clears cache/config dirs that point to root-owned paths (become
 * inaccessible after setuid/setgid privilege drop).
 *
 * **PREFER using `safeSpawnSync()` instead** — it calls this automatically and
 * also sets secure defaults (maxBuffer, shell: false, encoding).
 *
 * @returns Sanitized environment object safe for subprocess execution
 */
export function sanitizeSubprocessEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}

  for (const [key, value] of Object.entries(process.env)) {
    if (!DENIED_ENV_KEYS.has(key)) {
      env[key] = value
    }
  }

  // System: Ensure subprocess can write to /tmp
  env.TMPDIR = "/tmp"
  env.TMP = "/tmp"
  env.TEMP = "/tmp"

  // XDG Base Directory: Clear XDG cache/config that might point to /root
  delete env.XDG_CACHE_HOME
  delete env.XDG_CONFIG_HOME
  delete env.XDG_DATA_HOME
  delete env.XDG_STATE_HOME

  // Bun: Clear all bun-specific paths that might point to /root
  delete env.BUN_INSTALL
  delete env.BUN_INSTALL_CACHE_DIR
  delete env.BUN_INSTALL_BIN
  delete env.BUN_INSTALL_GLOBAL_DIR

  // NPM/PNPM/Yarn: Clear cache/config dirs that might point to /root
  delete env.NPM_CONFIG_CACHE
  delete env.NPM_CONFIG_PREFIX
  delete env.PNPM_HOME
  delete env.YARN_CACHE_FOLDER

  return env
}
