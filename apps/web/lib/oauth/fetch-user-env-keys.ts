/**
 * User Environment Keys Fetcher
 *
 * Fetches all user-defined environment keys from the lockbox.
 * These keys can be passed to MCP servers for custom integrations.
 */

import { getUserEnvKeysManager } from "./oauth-instances"

interface Logger {
  log: (message: string) => void
}

/**
 * Result type for user env keys fetch
 */
export interface UserEnvKeysFetchResult {
  /** Map of key names to decrypted values */
  envKeys: Record<string, string>
  /** Number of keys fetched */
  count: number
}

/**
 * Fetches all environment keys for a user.
 * Values are decrypted from the lockbox.
 *
 * @param userId - The user ID to fetch keys for
 * @param logger - Optional logger for debugging
 * @returns Object with env keys map and count
 *
 * @example
 * ```typescript
 * const { envKeys, count } = await fetchUserEnvKeys(user.id, logger)
 * // envKeys: { OPENAI_API_KEY: "sk-...", MY_SERVICE_TOKEN: "..." }
 * // count: 2
 * ```
 */
export async function fetchUserEnvKeys(userId: string, logger?: Logger): Promise<UserEnvKeysFetchResult> {
  try {
    const envKeys = await getUserEnvKeysManager().getAllUserEnvKeys(userId)
    const count = Object.keys(envKeys).length

    if (count > 0) {
      logger?.log(`Loaded ${count} user environment key(s): ${Object.keys(envKeys).join(", ")}`)
    }

    return { envKeys, count }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger?.log(`Failed to fetch user env keys: ${errorMessage}`)

    // Return empty on error - don't fail the whole request
    return { envKeys: {}, count: 0 }
  }
}

/**
 * Formats user env keys for passing to subprocess environment
 * Returns a flat object that can be spread into process.env
 *
 * @param envKeys - Map of key names to values
 * @param prefix - Optional prefix to add to all keys (default: "USER_")
 * @returns Object ready to spread into process env
 *
 * @example
 * ```typescript
 * const env = formatEnvKeysForSubprocess(envKeys, "USER_")
 * // { USER_OPENAI_API_KEY: "sk-...", USER_MY_SERVICE_TOKEN: "..." }
 * ```
 */
export function formatEnvKeysForSubprocess(
  envKeys: Record<string, string>,
  prefix: string = "",
): Record<string, string> {
  const result: Record<string, string> = {}

  for (const [key, value] of Object.entries(envKeys)) {
    result[`${prefix}${key}`] = value
  }

  return result
}
