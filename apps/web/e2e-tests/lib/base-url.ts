/**
 * Single source of truth for standard E2E base URL.
 * Must be present in the loaded env file (.env.test/.env.staging/.env.production).
 */
export function requireEnvAppBaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (!value) {
    throw new Error("NEXT_PUBLIC_APP_URL is required for E2E tests")
  }
  try {
    new URL(value)
  } catch {
    throw new Error(`NEXT_PUBLIC_APP_URL must be a valid absolute URL, got: "${value}"`)
  }
  return value
}

/**
 * Strictly require Playwright project.use.baseURL at runtime.
 * No fallback paths are allowed.
 */
export function requireProjectBaseUrl(baseUrl: unknown): string {
  if (typeof baseUrl !== "string" || baseUrl.trim().length === 0) {
    throw new Error("Playwright project.use.baseURL is required. Configure it explicitly in the project definition.")
  }
  return baseUrl
}
