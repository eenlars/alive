"use client"

import { WriteOutput } from "@/components/ui/chat/tools/write/WriteOutput"

export function WriteOutputPreview() {
  return (
    <div className="space-y-8">
      {/* Success - Small File */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Success (Small File)</h3>
        <div className="max-w-lg">
          <WriteOutput file_path="/src/components/Button.tsx" bytes_written={856} />
        </div>
      </section>

      {/* Success - Large File */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Success (Large File)</h3>
        <div className="max-w-lg">
          <WriteOutput file_path="/src/pages/Dashboard.tsx" bytes_written={24580} />
        </div>
      </section>

      {/* Error */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Error</h3>
        <div className="max-w-lg">
          <WriteOutput error="Permission denied: Cannot write to /etc/config" />
        </div>
      </section>
    </div>
  )
}
