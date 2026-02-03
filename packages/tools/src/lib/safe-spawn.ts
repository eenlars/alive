import { spawnSync, type SpawnSyncOptions, type SpawnSyncReturns } from "node:child_process"
import { platform } from "node:os"
import { sanitizeSubprocessEnv } from "./env-sanitizer.js"

/**
 * Default max buffer size for subprocess output (10MB).
 * Prevents ENOBUFS errors when commands produce large output (e.g., lint with many errors).
 */
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024

/**
 * Default timeout for subprocess execution (2 minutes).
 */
const DEFAULT_TIMEOUT = 120_000

/**
 * Safe spawn options with secure defaults for workspace tool execution.
 */
export interface SafeSpawnOptions extends Omit<SpawnSyncOptions, "env" | "shell" | "encoding"> {
  /** Override environment (defaults to sanitizeSubprocessEnv()) */
  env?: NodeJS.ProcessEnv
  /** Override shell (defaults to false for security) */
  shell?: boolean
  /** Override encoding (defaults to utf-8) */
  encoding?: BufferEncoding
}

/**
 * Safely execute a subprocess with secure defaults for workspace tools.
 *
 * This is the **required** way to spawn subprocesses in workspace tools.
 * It enforces:
 * - Sanitized environment (no root-owned paths leak through)
 * - Large buffer (10MB) to prevent ENOBUFS on large output
 * - No shell execution (prevents injection)
 * - UTF-8 encoding for consistent string output
 *
 * @example
 * ```typescript
 * const result = safeSpawnSync("bun", ["run", "lint"], {
 *   cwd: workspaceRoot,
 *   timeout: 60000,
 * })
 *
 * if (result.error) {
 *   // Command failed to execute (e.g., bun not found)
 * }
 *
 * if (result.status !== 0) {
 *   // Command ran but returned non-zero exit code
 * }
 * ```
 */
export function safeSpawnSync(
  command: string,
  args: readonly string[],
  options?: SafeSpawnOptions,
): SpawnSyncReturns<string> {
  const timeoutSecs = Math.ceil((options?.timeout ?? DEFAULT_TIMEOUT) / 1000)

  // On Linux, use `timeout --kill-after=5` which:
  // 1. Sends SIGTERM after timeout, then SIGKILL after 5 more seconds
  // 2. Uses process groups to kill ALL descendants, not just direct child
  // This prevents orphaned processes from commands like `turbo` that spawn children
  if (platform() === "linux") {
    return spawnSync("timeout", ["--kill-after=5", `${timeoutSecs}`, command, ...args], {
      encoding: "utf-8",
      maxBuffer: DEFAULT_MAX_BUFFER,
      shell: false,
      ...options,
      // Don't pass timeout to spawnSync - we're using the timeout command instead
      timeout: undefined,
      // Always sanitize env - override if provided, otherwise use default
      env: options?.env ?? sanitizeSubprocessEnv(),
    })
  }

  // Fallback for non-Linux (macOS, Windows)
  return spawnSync(command, args, {
    encoding: "utf-8",
    timeout: DEFAULT_TIMEOUT,
    maxBuffer: DEFAULT_MAX_BUFFER,
    shell: false,
    killSignal: "SIGKILL",
    ...options,
    // Always sanitize env - override if provided, otherwise use default
    env: options?.env ?? sanitizeSubprocessEnv(),
  })
}
