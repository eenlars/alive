"use client"

import type { Template } from "@/types/templates"

interface SuperTemplateConfirmDialogProps {
  template: Template
  onConfirm: () => void
  onCancel: () => void
}

export function SuperTemplateConfirmDialog({ template, onConfirm, onCancel }: SuperTemplateConfirmDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div
        className="bg-white dark:bg-[#1a1a1a] shadow-xl w-full max-w-md
          animate-in fade-in-0 zoom-in-95 duration-200"
        style={{ borderRadius: "8px" }}
      >
        {/* Content */}
        <div className="p-8">
          <h3 className="text-base font-[500] text-black dark:text-white mb-3">Add {template.name}?</h3>

          <p className="text-sm font-[200] text-black/60 dark:text-white/60 leading-relaxed">
            Takes about {template.estimatedTime}. You can undo if needed.
          </p>
        </div>

        {/* Footer */}
        <div className="px-8 pb-8 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-[400] text-black/60 dark:text-white/60
              hover:text-black dark:hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 px-4 py-2 text-sm font-[500] bg-black text-white dark:bg-white dark:text-black
              hover:bg-black/80 dark:hover:bg-white/80 transition-colors"
            style={{ borderRadius: "2px" }}
          >
            Add it
          </button>
        </div>
      </div>
    </div>
  )
}
