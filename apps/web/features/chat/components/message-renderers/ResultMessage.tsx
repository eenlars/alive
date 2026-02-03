import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk"
import { ErrorCodes, getErrorHelp, getErrorMessage } from "@/lib/error-codes"

interface ResultMessageProps {
  content: SDKResultMessage
}

export function ResultMessage({ content }: ResultMessageProps) {
  // Map SDK subtype to error code
  const getErrorCode = () => {
    if (content.subtype === "error_max_turns") {
      return ErrorCodes.ERROR_MAX_TURNS
    }
    return null
  }

  const errorCode = getErrorCode()

  const getDisplayMessage = () => {
    if (errorCode) {
      return getErrorMessage(errorCode)
    }
    return "An error occurred during execution"
  }

  const getDisplayHelp = () => {
    if (errorCode) {
      return getErrorHelp(errorCode)
    }
    return null
  }

  if (content.is_error) {
    return (
      <div className="py-3 mb-4">
        <div className="border border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/30 p-4 rounded">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <svg
                className="w-5 h-5 text-red-500 dark:text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-red-900 dark:text-red-300 mb-1">Execution Error</h3>
              <p className="text-sm text-red-700 dark:text-red-400 leading-relaxed">{getDisplayMessage()}</p>
              {getDisplayHelp() && (
                <p className="text-xs text-red-600 dark:text-red-500 mt-2 leading-relaxed">{getDisplayHelp()}</p>
              )}
              {errorCode && (
                <div className="mt-2 text-xs text-red-500/70 dark:text-red-400/70">
                  <span className="font-mono">{errorCode}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Never show completion stats
  return null
}
