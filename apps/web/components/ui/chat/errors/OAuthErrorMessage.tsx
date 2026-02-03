import { AlertCircle } from "lucide-react"

export function OAuthErrorMessage() {
  return (
    <div className="my-6 max-w-2xl">
      <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 rounded-lg p-5">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100">Session Expired</h3>
            <p className="text-sm text-amber-800 dark:text-amber-200 mt-1">
              Please contact your administrator to restore access.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
