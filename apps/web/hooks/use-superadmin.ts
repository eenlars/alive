/**
 * Superadmin Feature Flag Hook
 *
 * Client-side hook to check if current user is a superadmin.
 * Uses the /api/auth/me endpoint to fetch user info.
 *
 * Note: This is for UI feature flags only.
 * Actual security checks must happen server-side.
 */

"use client"

import { useEffect, useState } from "react"

interface AuthMeResponse {
  ok: boolean
  user?: {
    id: string
    email: string
    name: string | null
    isSuperadmin: boolean
    isAdmin: boolean
  }
}

/**
 * Check if current user is a superadmin
 *
 * @returns {boolean} - True if user is superadmin, false otherwise
 *
 * Usage:
 * ```tsx
 * const isSuperadmin = useSuperadmin()
 * if (isSuperadmin) {
 *   return <SuperadminOnlyFeature />
 * }
 * ```
 */
export function useSuperadmin(): boolean {
  const [isSuperadmin, setIsSuperadmin] = useState(false)

  useEffect(() => {
    async function checkSuperadmin() {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" })
        if (!res.ok) return

        const data: AuthMeResponse = await res.json()
        if (data.ok && data.user?.isSuperadmin) {
          setIsSuperadmin(true)
        }
      } catch {
        // Silently fail - not a superadmin
      }
    }

    checkSuperadmin()
  }, [])

  return isSuperadmin
}

/**
 * Hook that returns full user info for admins
 */
export function useAdminUser() {
  const [user, setUser] = useState<AuthMeResponse["user"] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" })
        if (!res.ok) {
          setLoading(false)
          return
        }

        const data: AuthMeResponse = await res.json()
        if (data.ok && data.user) {
          setUser(data.user)
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false)
      }
    }

    fetchUser()
  }, [])

  return { user, loading, isSuperadmin: user?.isSuperadmin ?? false, isAdmin: user?.isAdmin ?? false }
}
