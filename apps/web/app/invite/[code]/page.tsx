"use client"

import { useParams, useRouter } from "next/navigation"
import { useEffect } from "react"
import { storeReferralCode } from "@/lib/referral"

/**
 * Referral Landing Page
 *
 * Captures referral code from URL and stores it in localStorage.
 * Immediately redirects to home page.
 *
 * Flow:
 * 1. User visits /invite/ABC123
 * 2. Code is extracted from URL params
 * 3. Code is stored in localStorage with 30-day expiry
 * 4. User is redirected to /
 *
 * If code is missing/invalid, still redirects gracefully.
 */
export default function InvitePage() {
  const router = useRouter()
  const params = useParams()
  const code = params.code as string

  useEffect(() => {
    // Store the referral code if present
    if (code) {
      storeReferralCode(code)
    }

    // Always redirect to home
    router.replace("/")
  }, [code, router])

  // Render nothing while redirecting
  return null
}
