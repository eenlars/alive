/**
 * Security utility to prevent client-side imports of server-only modules.
 *
 * This function should be called at the top of any module that contains
 * server-only functionality (e.g., database access, API keys, file system operations).
 *
 * @param moduleName - The name of the module being protected (for error messages)
 * @throws Error if called in a browser environment (unless in test mode)
 * @example
 * // At the top of a server-only file:
 * assertServerOnly("lib/supabase/server")
 */
export function assertServerOnly(moduleName: string): void {
  const isTestEnv = process.env.NODE_ENV === "test" || "vi" in globalThis

  if (typeof window !== "undefined" && !isTestEnv) {
    throw new Error(
      `[SECURITY] ${moduleName} cannot be imported in client-side code. ` +
        "This module contains server-only functionality that must not be exposed to the browser. " +
        "If you need this functionality, create a server action or API route instead.",
    )
  }
}
