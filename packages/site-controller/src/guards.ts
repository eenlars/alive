/**
 * Runtime environment guards
 *
 * These utilities help prevent server-only code from running in the browser.
 * Similar to how popular SDKs like Supabase, Stripe, etc. protect their server code.
 */

/**
 * Throws an error if called in a browser environment
 *
 * @param packageName - Name of the package/module
 * @param suggestion - Optional suggestion for what to use instead
 *
 * @example
 * ```ts
 * assertServerOnly('@webalive/site-controller', 'Use @webalive/shared for constants')
 * ```
 */
export function assertServerOnly(packageName: string, suggestion?: string): void {
  if (typeof window !== 'undefined') {
    const suggestionText = suggestion
      ? `\n║  💡 Suggestion: ${suggestion.padEnd(45)} ║\n`
      : ''

    throw new Error(
      '\n\n' +
      '╔════════════════════════════════════════════════════════════════╗\n' +
      '║  ⚠️  SERVER-ONLY CODE IMPORTED IN BROWSER                     ║\n' +
      '╟────────────────────────────────────────────────────────────────╢\n' +
      `║  Package: ${packageName.padEnd(49)} ║\n` +
      '║                                                                ║\n' +
      '║  This code uses Node.js APIs and cannot run in the browser.   ║\n' +
      suggestionText +
      '║                                                                ║\n' +
      '║  Check your imports and ensure server-only code is only       ║\n' +
      '║  used in API routes, server components, or server actions.    ║\n' +
      '╚════════════════════════════════════════════════════════════════╝\n'
    )
  }
}

/**
 * Check if running in a Node.js environment (not browser)
 */
export function isServerEnvironment(): boolean {
  return typeof window === 'undefined'
}

/**
 * Check if running in a browser environment
 */
export function isBrowserEnvironment(): boolean {
  return typeof window !== 'undefined'
}
