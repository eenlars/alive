/**
 * Safe build info loader with fallbacks
 *
 * Loads build-info.json with multiple fallback strategies:
 * 1. Try to require the actual file
 * 2. Fall back to default values if missing
 *
 * This avoids import-time errors when the file isn't generated yet.
 */

interface BuildInfo {
  commit: string
  branch: string
  buildTime: string
}

let cached: BuildInfo | null = null

export function getBuildInfo(): BuildInfo {
  if (cached) return cached

  try {
    // Try dynamic require (works in server context)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const info = require("./build-info.json") as BuildInfo
    cached = info
    return info
  } catch {
    // File doesn't exist or can't be loaded - return defaults
    cached = {
      commit: "unknown",
      branch: "development",
      buildTime: new Date().toISOString(),
    }
    return cached
  }
}

export default getBuildInfo()
