import { SUPPORTED_OAUTH_PROVIDERS } from "@/lib/oauth/oauth-instances"

type SupportedProvider = (typeof SUPPORTED_OAUTH_PROVIDERS)[number]

const PROVIDER_NAME_REGEX = /^[a-z0-9_-]{1,32}$/

function isSupportedProvider(value: string): value is SupportedProvider {
  for (const provider of SUPPORTED_OAUTH_PROVIDERS) {
    if (provider === value) return true
  }
  return false
}

export function validateProviderName(provider: unknown): {
  valid: boolean
  provider?: string
  error?: string
} {
  if (typeof provider !== "string") {
    return { valid: false, error: "Provider must be a string" }
  }

  const normalized = provider.toLowerCase().trim()

  if (normalized.length === 0) {
    return { valid: false, error: "Provider cannot be empty" }
  }

  if (normalized.length > 32) {
    return { valid: false, error: "Provider name too long" }
  }

  if (!PROVIDER_NAME_REGEX.test(normalized)) {
    return { valid: false, error: "Provider name contains invalid characters" }
  }

  if (!isSupportedProvider(normalized)) {
    return { valid: false, error: "Unsupported provider" }
  }

  return { valid: true, provider: normalized }
}

export function isKnownProvider(provider: string): boolean {
  return isSupportedProvider(provider.toLowerCase())
}

export function getKnownProviders(): readonly string[] {
  return [...SUPPORTED_OAUTH_PROVIDERS]
}
