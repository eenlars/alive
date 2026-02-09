/**
 * Sandboxed Environment for Workspace Child Processes
 *
 * SECURITY CRITICAL: The Bridge process has secrets that must NEVER leak to
 * workspace users. This module builds an explicit allowlist of env vars that
 * child processes need. Everything else is excluded.
 *
 * Leaked secrets if this breaks:
 *   SUPABASE_SERVICE_ROLE_KEY, JWT_SECRET, LOCKBOX_MASTER_KEY,
 *   DATABASE_URL, DATABASE_PASSWORD, REDIS_URL, STRIPE_OAUTH_TOKEN,
 *   LINEAR_CLIENT_SECRET, GOOGLE_CLIENT_SECRET, and ~15 more.
 *
 * Used by:
 *   - agent-child-runner.ts (Claude agent process)
 *   - command-runner.ts (workspace commands like bun install)
 */

/**
 * Env vars that are safe to pass to workspace child processes.
 *
 * ADDING TO THIS LIST? Ask: "Would it be a security incident if a user
 * ran `echo $THIS_VAR` in their workspace?" If yes, don't add it.
 */
const ALLOWED_ENV_KEYS = [
  // System essentials — needed for binaries to be found and run
  "PATH",
  "LANG",
  "LC_ALL",
  "NODE_ENV",

  // Temp directories — processes need a writable temp dir
  "TMPDIR",
  "TMP",
  "TEMP",

  // Bun runtime — needed for bun to find its install and modules
  "BUN_INSTALL",

  // MCP tool API callbacks — tools call back to Bridge via localhost
  "PORT",
  "BRIDGE_API_PORT",
  "INTERNAL_TOOLS_SECRET",
] as const

type SandboxEnv = Record<string, string | undefined>

/**
 * Build a sandboxed env object for workspace child processes.
 *
 * Only includes vars from the allowlist. Everything else (database creds,
 * API keys, OAuth secrets, etc.) is excluded.
 *
 * Callers should add process-specific vars on top:
 *   { ...createSandboxEnv(), TARGET_UID: "1000", ANTHROPIC_API_KEY: key }
 */
export function createSandboxEnv(): SandboxEnv {
  const env: SandboxEnv = {}

  for (const key of ALLOWED_ENV_KEYS) {
    if (process.env[key] !== undefined) {
      env[key] = process.env[key]
    }
  }

  // Always set temp to /tmp (safe, world-writable)
  env.TMPDIR = "/tmp"
  env.TMP = "/tmp"
  env.TEMP = "/tmp"

  return env
}
