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
  apiKey?: string
  userEnvKeys?: Record<string, string>
}

export interface EnvPrepResult {
  apiKeySource: "user" | "oauth"
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
 *  2. ANTHROPIC_API_KEY is deleted unless the request supplies one
 *  3. All previous USER_* keys are deleted before new ones are applied
 *  4. USER_* key names are validated (uppercase alphanumeric + underscore)
 */
export function prepareRequestEnv(payload: EnvPayload): EnvPrepResult {
  // 1. Session cookie — always overwrite to prevent cross-user leakage
  process.env.ALIVE_SESSION_COOKIE = payload.sessionCookie || ""

  // 2. API key — set from payload or delete stale value
  let apiKeySource: "user" | "oauth"
  if (payload.apiKey) {
    process.env.ANTHROPIC_API_KEY = payload.apiKey
    apiKeySource = "user"
  } else {
    delete process.env.ANTHROPIC_API_KEY
    apiKeySource = "oauth"
  }

  // 3. Clear ALL previous USER_* env keys before setting new ones
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("USER_")) {
      delete process.env[key]
    }
  }

  // 4. Apply new user env keys (validated format only)
  const userEnvKeys = payload.userEnvKeys || {}
  let appliedCount = 0
  for (const [keyName, keyValue] of Object.entries(userEnvKeys)) {
    if (/^[A-Z][A-Z0-9_]*$/.test(keyName)) {
      process.env[`USER_${keyName}`] = keyValue
      appliedCount++
    }
  }

  return { apiKeySource, userEnvKeyCount: appliedCount }
}
