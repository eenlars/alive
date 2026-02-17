/**
 * Request-scoped environment isolation.
 *
 * Prevents credential/secret leakage between requests handled by the same
 * long-lived worker process.  Extracted from worker-entry.mjs so the
 * security invariants can be tested behaviourally.
 */

/** Subset of the IPC payload that affects process.env */
export interface EnvPayload {
  sessionCookie?: string
  oauthAccessToken?: string
  userEnvKeys?: Record<string, string>
}

export interface EnvPrepResult {
  authSource: "oauth"
  userEnvKeyCount: number
}

/**
 * Prepare process.env for a new worker request.
 *
 * MUST be called before every `query()` invocation to prevent env leakage
 * between users sharing the same worker process.
 *
 * Invariants enforced:
 *  1. ALIVE_SESSION_COOKIE is always set (or cleared to "")
 *  2. Auth env is always explicit per request via oauthAccessToken,
 *     and auth-related fallback vars are cleared to avoid stale/leaked credentials.
 *  3. ANTHROPIC_API_KEY is always set to "" (not deleted)
 *     — prevents workspace .env files from overriding OAuth credentials
 *  4. All previous USER_* keys are deleted before new ones are applied
 *  5. USER_* key names are validated (uppercase alphanumeric + underscore)
 */
export function prepareRequestEnv(payload: EnvPayload): EnvPrepResult {
  // 1. Session cookie — always overwrite to prevent cross-user leakage
  process.env.ALIVE_SESSION_COOKIE = payload.sessionCookie || ""

  // 2. Clear alternate auth channels we don't use for worker auth.
  //    Worker auth must be explicit from payload, never implicit from process env.
  process.env.ANTHROPIC_AUTH_TOKEN = ""
  process.env.CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR = ""
  process.env.CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR = ""

  // 3. OAuth token auth only.
  //    IMPORTANT: Set ANTHROPIC_API_KEY to "" (not delete). Deleting allows the
  //    Claude CLI subprocess to pick up ANTHROPIC_API_KEY from workspace .env
  //    files, which would override OAuth with a potentially stale user key.
  //    An empty string is treated as unset by the CLI.
  process.env.ANTHROPIC_API_KEY = ""
  process.env.CLAUDE_CODE_OAUTH_TOKEN = payload.oauthAccessToken || ""

  // 4. Clear ALL previous USER_* env keys before setting new ones
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("USER_")) {
      delete process.env[key]
    }
  }

  // 5. Apply new user env keys (validated format only)
  const userEnvKeys = payload.userEnvKeys || {}
  let appliedCount = 0
  for (const [keyName, keyValue] of Object.entries(userEnvKeys)) {
    if (/^[A-Z][A-Z0-9_]*$/.test(keyName)) {
      process.env[`USER_${keyName}`] = keyValue
      appliedCount++
    }
  }

  return { authSource: "oauth", userEnvKeyCount: appliedCount }
}
