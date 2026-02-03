"use client"

import { AlertTriangle, CheckCircle, Info } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

export function AlertPreview() {
  return (
    <div className="space-y-8 max-w-lg">
      {/* Default Alert */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Default</h3>
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            This is an informational alert. It provides context or helpful information.
          </AlertDescription>
        </Alert>
      </section>

      {/* Destructive Alert */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Destructive</h3>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Something went wrong. Please check your input and try again.</AlertDescription>
        </Alert>
      </section>

      {/* Success Alert (custom styling) */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Success (Custom)</h3>
        <Alert className="border-green-500/50 dark:border-green-500/50 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/20 [&>svg]:text-green-600 dark:[&>svg]:text-green-400">
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>Your changes have been saved successfully.</AlertDescription>
        </Alert>
      </section>

      {/* Without Icon */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Without Icon</h3>
        <Alert>
          <AlertDescription>A simple alert without an icon. Just text content.</AlertDescription>
        </Alert>
      </section>
    </div>
  )
}
