import type { AuthStatusContent } from "@/features/chat/lib/message-parser"
import { PulsingDot } from "../ui/PulsingDot"

interface AuthStatusMessageProps {
  content: AuthStatusContent
}

export function AuthStatusMessage({ content }: AuthStatusMessageProps) {
  const hasError = !!content.error

  if (hasError) {
    return (
      <div className="py-2 flex items-center justify-center">
        <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2">
            <svg
              className="w-4 h-4 text-red-600 dark:text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span className="text-sm text-red-800 dark:text-red-200 font-medium">Authentication failed</span>
          </div>
          {content.error && <span className="text-xs text-red-600 dark:text-red-400">{content.error}</span>}
        </div>
      </div>
    )
  }

  if (content.isAuthenticating) {
    return (
      <div className="py-2 flex items-center justify-center">
        <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800">
          <div className="flex items-center gap-2">
            <PulsingDot size="sm" />
            <span className="text-sm text-purple-800 dark:text-purple-200 font-medium">Authenticating...</span>
          </div>
        </div>
      </div>
    )
  }

  // Authentication complete
  return (
    <div className="py-2 flex items-center justify-center">
      <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
        <div className="flex items-center gap-2">
          <svg
            className="w-4 h-4 text-green-600 dark:text-green-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm text-green-800 dark:text-green-200 font-medium">Authenticated</span>
        </div>
      </div>
    </div>
  )
}
