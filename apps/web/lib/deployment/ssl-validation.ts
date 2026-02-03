import { retryAsync } from "@webalive/shared"
import { errorLogger } from "@/lib/error-logger"

interface NodeError extends Error {
  code?: string
}

function isNodeError(error: unknown): error is NodeError {
  return error instanceof Error && "code" in error
}

export interface SSLValidationResult {
  success: boolean
  error?: string
}

/**
 * Check if error is expected during SSL/site startup (should keep retrying)
 */
function isExpectedStartupError(error: unknown): boolean {
  const errorMessage = error instanceof Error ? error.message : String(error)
  const errorCode = isNodeError(error) ? error.code : undefined

  return (
    (error instanceof Error && error.name === "TimeoutError") ||
    errorCode === "ECONNREFUSED" ||
    errorCode === "ENOTFOUND" ||
    errorMessage.includes("certificate") ||
    errorMessage.includes("SSL") ||
    errorMessage.includes("TLS") ||
    errorMessage.includes("Site not ready")
  )
}

/**
 * Validate that a domain has a working SSL certificate and serves content.
 * Uses exponential backoff with retries to wait for certificate provisioning.
 */
export async function validateSSLCertificate(domain: string): Promise<SSLValidationResult> {
  try {
    await retryAsync(
      async () => {
        // Use GET to verify the site actually returns content, not just HEAD
        const response = await fetch(`https://${domain}`, {
          method: "GET",
          signal: AbortSignal.timeout(5000),
        })

        // Only consider 200-299 as success (site is serving content)
        // Don't accept 404, 500, etc. - the site should be fully working
        if (!response.ok) {
          throw new Error(`Site not ready - status ${response.status}`)
        }

        const contentType = response.headers.get("content-type")
        console.log(`[SSL CHECK] Site ready for ${domain} (status: ${response.status}, content-type: ${contentType})`)
      },
      {
        // Fast check: 3 attempts × 2s = max 6-9s total (was 12 × 5-10s = 60-120s)
        // Cloudflare domains have unpredictable SSL provisioning, don't block on it
        attempts: 3,
        minDelayMs: 2000,
        maxDelayMs: 3000,
        jitter: 0.1,
        shouldRetry: isExpectedStartupError,
        // No onRetry logging - it's fire-and-forget, caller handles errors
      },
    )

    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    if (!isExpectedStartupError(error)) {
      errorLogger.capture({
        category: "ssl-validation",
        source: "backend",
        message: `Unexpected SSL error for ${domain}`,
        details: { domain, error: errorMessage },
        stack: error instanceof Error ? error.stack : undefined,
      })
    }

    return {
      success: false,
      error: `Site not ready after retries: ${errorMessage}`,
    }
  }
}
