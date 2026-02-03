"use client"

import { LoadingSpinner } from "@/components/ui/LoadingSpinner"

export function LoadingSpinnerPreview() {
  return (
    <div className="space-y-8">
      {/* Default */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Default</h3>
        <LoadingSpinner />
      </section>

      {/* In Context */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">In Context</h3>
        <div className="max-w-sm p-8 border border-black/10 dark:border-white/10 rounded-lg flex flex-col items-center justify-center">
          <LoadingSpinner />
          <p className="mt-4 text-sm text-black/60 dark:text-white/60">Loading content...</p>
        </div>
      </section>
    </div>
  )
}
