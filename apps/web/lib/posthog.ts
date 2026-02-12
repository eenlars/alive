import posthog from "posthog-js"

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY

/**
 * Reset PostHog identity on logout.
 * Call this from logout handlers to clear the distinct_id and device_id,
 * ensuring the next user gets a clean session.
 */
export function resetPostHogIdentity() {
  if (typeof window === "undefined" || !posthogKey) return
  posthog.reset(true)
}
