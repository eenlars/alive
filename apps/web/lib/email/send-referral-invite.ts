import { retryAsync } from "@webalive/shared"
import { EMAIL_TEMPLATES } from "@/config/emails"

interface SendReferralInviteParams {
  to: string
  senderName: string
  inviteLink: string
}

interface LoopsResponse {
  success: boolean
  id?: string
}

/**
 * Check if error is retryable (network errors, rate limits, server errors)
 */
function isRetryableEmailError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message
    // Network errors
    if (msg.includes("fetch failed") || msg.includes("ECONNRESET") || msg.includes("ETIMEDOUT")) {
      return true
    }
    // Rate limits or server errors
    if (msg.includes("429") || msg.includes("502") || msg.includes("503") || msg.includes("504")) {
      return true
    }
  }
  return false
}

/**
 * Send a referral invite email via Loops.so transactional API.
 * Includes retry logic for transient failures.
 *
 * @throws Error if LOOPS_API_KEY is not configured
 * @throws Error if Loops API returns an error response after retries
 */
export async function sendReferralInvite({
  to,
  senderName,
  inviteLink,
}: SendReferralInviteParams): Promise<LoopsResponse> {
  const LOOPS_API_KEY = process.env.LOOPS_API_KEY
  if (!LOOPS_API_KEY) {
    throw new Error("LOOPS_API_KEY not configured")
  }

  return retryAsync(
    async () => {
      const response = await fetch("https://app.loops.so/api/v1/transactional", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOOPS_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transactionalId: EMAIL_TEMPLATES.referralInvite,
          email: to,
          dataVariables: {
            senderName,
            inviteLink,
          },
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Loops API error: ${response.status} - ${error}`)
      }

      return response.json()
    },
    {
      attempts: 3,
      minDelayMs: 1000,
      maxDelayMs: 10000,
      jitter: 0.2,
      shouldRetry: isRetryableEmailError,
      onRetry: ({ attempt, delayMs, err }) => {
        console.log(
          `[email] Retry ${attempt}/3 sending to ${to} in ${delayMs}ms:`,
          err instanceof Error ? err.message : err,
        )
      },
    },
  )
}
