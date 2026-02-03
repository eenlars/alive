"use client"

import { REFERRAL } from "@webalive/shared"
import { useEffect } from "react"
import { clearStoredReferralCode, getStoredReferralCode } from "@/lib/referral"

const SESSION_KEY = "referral_redeem_attempted"

/**
 * Hook to redeem a stored referral code after signup.
 *
 * Should be called once on the chat page (or auth callback).
 * - Checks localStorage for stored referral code
 * - Calls POST /api/referrals/redeem
 * - Clears code on success or client error (400)
 * - Keeps code on server error (500) to allow retry
 *
 * Uses sessionStorage to track attempts (survives React 18 Strict Mode remounts).
 */
export function useRedeemReferral() {
  useEffect(() => {
    // Skip if referral system is disabled
    if (!REFERRAL.ENABLED) return

    // Use sessionStorage to survive React 18 Strict Mode double-mount
    if (sessionStorage.getItem(SESSION_KEY)) return
    sessionStorage.setItem(SESSION_KEY, "1")

    const code = getStoredReferralCode()
    if (!code) return

    fetch("/api/referrals/redeem", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .then(async res => {
        const data = await res.json()

        if (data.ok) {
          // Success - clear the code
          console.log("Referral redeemed:", data.status)
          clearStoredReferralCode()
        } else if (res.status === 400) {
          // Client error (invalid code, already referred, etc) - clear to prevent retry
          console.log("Referral not valid:", data.error)
          clearStoredReferralCode()
        }
        // On 500 server error: DON'T clear - allow retry on next page load
      })
      .catch(err => {
        // Network error - DON'T clear, allow retry
        console.error("Referral redeem failed:", err)
      })
  }, [])
}
