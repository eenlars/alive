/**
 * Sanitize environment variables for subprocess execution after privilege drop.
 *
 * When parent process runs as root and spawns child that drops to workspace user
 * (setuid/setgid), inherited environment variables can point to root-owned paths
 * that become inaccessible, causing failures.
 *
 * This function clears cache/config directories that point to root-owned paths
 * which become inaccessible after privilege drop, and ensures subprocess can
 * write to /tmp.
 *
 * **PREFER using `safeSpawnSync()` instead** - it calls this automatically and
 * also sets secure defaults (maxBuffer, shell: false, encoding).
 *
 * @returns Sanitized environment object safe for subprocess execution
 *
 * @example
 * ```typescript
 * // Preferred: use safeSpawnSync (auto-sanitizes env)
 * import { safeSpawnSync } from "./safe-spawn.js"
 * const result = safeSpawnSync("bun", ["add", "lodash"], { cwd: workspaceRoot })
 *
 * // Direct usage (only if you can't use safeSpawnSync)
 * const result = spawnSync("bun", ["add", "lodash"], {
 *   cwd: workspaceRoot,
 *   env: sanitizeSubprocessEnv(),
 *   shell: false,
 *   maxBuffer: 10 * 1024 * 1024, // Don't forget this!
 * })
 * ```
 */
export function sanitizeSubprocessEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,

    // System: Ensure subprocess can write to /tmp
    TMPDIR: "/tmp",
    TMP: "/tmp",
    TEMP: "/tmp",

    // XDG Base Directory: Clear XDG cache/config that might point to /root
    XDG_CACHE_HOME: undefined,
    XDG_CONFIG_HOME: undefined,
    XDG_DATA_HOME: undefined,
    XDG_STATE_HOME: undefined,

    // Bun: Clear all bun-specific paths that might point to /root
    BUN_INSTALL: undefined, // THIS IS THE KEY ONE - points to /root/.bun
    BUN_INSTALL_CACHE_DIR: undefined,
    BUN_INSTALL_BIN: undefined,
    BUN_INSTALL_GLOBAL_DIR: undefined,

    // NPM (future-proofing): Clear npm cache/config that might point to /root
    NPM_CONFIG_CACHE: undefined,
    NPM_CONFIG_PREFIX: undefined,

    // PNPM (future-proofing): Clear pnpm home directory
    PNPM_HOME: undefined,

    // Yarn (future-proofing): Clear yarn cache directory
    YARN_CACHE_FOLDER: undefined,

    // Keep all other environment variables as-is
  }
}
