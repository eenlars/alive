import { DOMAINS, TEST_CONFIG } from "@webalive/shared"
import { TEST_ENV } from "./test-env"

const ENV_BASE_URL_BY_TEST_ENV: Record<typeof TEST_ENV, string> = {
  local: TEST_CONFIG.BASE_URL,
  staging: DOMAINS.STREAM_STAGING,
  production: DOMAINS.STREAM_PROD,
}

/**
 * Resolve base URL from Playwright project config with TEST_ENV fallback.
 * Playwright can omit inherited top-level `use.baseURL` in some global/setup contexts.
 */
export function resolveE2eBaseUrl(configBaseUrl?: string): string {
  if (typeof configBaseUrl === "string" && configBaseUrl.length > 0) {
    return configBaseUrl
  }

  const envAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (envAppUrl) {
    return envAppUrl
  }

  const sharedBaseUrl = ENV_BASE_URL_BY_TEST_ENV[TEST_ENV]?.trim()
  if (sharedBaseUrl) {
    return sharedBaseUrl
  }

  if (TEST_ENV === "local") {
    return TEST_CONFIG.BASE_URL
  }

  throw new Error(`Unable to resolve E2E base URL for TEST_ENV="${TEST_ENV}". Set NEXT_PUBLIC_APP_URL in env file.`)
}

export function getResolvedBaseUrlSource(configBaseUrl?: string): "config" | "env" | "shared" | "local-default" {
  if (typeof configBaseUrl === "string" && configBaseUrl.length > 0) {
    return "config"
  }
  if (process.env.NEXT_PUBLIC_APP_URL?.trim()) {
    return "env"
  }
  if (ENV_BASE_URL_BY_TEST_ENV[TEST_ENV]?.trim()) {
    return "shared"
  }
  if (TEST_ENV === "local") {
    return "local-default"
  }
  throw new Error(`Unable to resolve E2E base URL for TEST_ENV="${TEST_ENV}". Set NEXT_PUBLIC_APP_URL in env file.`)
}
