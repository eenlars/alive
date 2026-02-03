"use client"

import { LogIn } from "lucide-react"
import { useAuthActions, useSessionExpiredReason } from "@/lib/stores/authStore"

/**
 * SessionExpiredModal - Non-dismissable modal for session expiry
 *
 * This modal appears when the user's session has expired (401 error).
 * It cannot be dismissed by clicking outside or pressing Escape.
 * The only action is to go to the login page.
 *
 * This prevents the UX bug where dismissing would just reopen the modal
 * (because the error state persists until successful re-auth).
 */
export function SessionExpiredModal() {
  const { redirectToLogin } = useAuthActions()
  const reason = useSessionExpiredReason()

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-expired-title"
      aria-describedby="session-expired-description"
    >
      <div
        className="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95 fade-in-0 duration-200"
        onClick={e => e.stopPropagation()}
        role="document"
      >
        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <LogIn size={32} className="text-amber-600 dark:text-amber-400" />
          </div>
        </div>

        {/* Title */}
        <h2 id="session-expired-title" className="text-xl font-semibold text-center text-black dark:text-white mb-2">
          Session Expired
        </h2>

        {/* Description */}
        <p id="session-expired-description" className="text-center text-black/60 dark:text-white/60 mb-6">
          {reason || "Your session has expired. Please log in again to continue."}
        </p>

        {/* Action Button */}
        <button
          type="button"
          onClick={redirectToLogin}
          className="w-full px-4 py-3 bg-black dark:bg-white text-white dark:text-black rounded-lg font-medium hover:bg-black/90 dark:hover:bg-white/90 transition-colors flex items-center justify-center gap-2"
        >
          <LogIn size={18} />
          Go to Login
        </button>

        {/* Help text */}
        <p className="text-xs text-center text-black/40 dark:text-white/40 mt-4">
          Your work is saved. You can continue where you left off after logging in.
        </p>
      </div>
    </div>
  )
}
