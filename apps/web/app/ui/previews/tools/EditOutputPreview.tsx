"use client"

import { EditOutput } from "@/components/ui/chat/tools/edit/EditOutput"

export function EditOutputPreview() {
  return (
    <div className="space-y-8">
      {/* Single Replacement */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Single Replacement</h3>
        <div className="max-w-lg">
          <EditOutput file_path="/src/config.ts" replacements={1} />
        </div>
      </section>

      {/* Multiple Replacements */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Multiple Replacements</h3>
        <div className="max-w-lg">
          <EditOutput file_path="/src/utils/helpers.ts" replacements={5} />
        </div>
      </section>

      {/* Error */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Error</h3>
        <div className="max-w-lg">
          <EditOutput error="old_string not found in file" />
        </div>
      </section>
    </div>
  )
}
