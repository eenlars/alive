"use client"

import { ArrowLeft } from "lucide-react"
import type { Template } from "@/types/templates"

interface SuperTemplatePreviewProps {
  template: Template
  onBack: () => void
  onInsert: () => void
}

export function SuperTemplatePreview({ template, onBack, onInsert }: SuperTemplatePreviewProps) {
  return (
    <div className="h-full flex flex-col">
      {/* Action bar: Back + Insert */}
      <div className="flex items-center justify-between gap-4 pb-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-[400] text-black/60 dark:text-white/60
            hover:text-black dark:hover:text-white transition-colors"
        >
          <ArrowLeft size={16} />
          Back
        </button>
        <button
          type="button"
          onClick={onInsert}
          className="px-4 py-2 rounded-full bg-black text-white dark:bg-white dark:text-black
            hover:brightness-[0.85] active:brightness-75 transition-all duration-150
            text-sm font-[500]"
        >
          Use Template
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto space-y-4">
        {/* Time + Description */}
        <div className="space-y-2">
          <p className="text-xs font-[300] text-black/40 dark:text-white/40">{template.estimatedTime}</p>
          <p className="text-sm font-[300] text-black/60 dark:text-white/60 leading-relaxed max-w-2xl">
            {template.description}
          </p>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5">
          {template.tags.map(tag => (
            <span
              key={tag}
              className="text-xs font-[300] px-2.5 py-1 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-black/50 dark:text-white/50"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Preview image */}
        <div className="pt-2">
          <img
            src={template.previewImage}
            alt={`${template.name} preview`}
            className="w-full max-w-3xl rounded-xl ring-1 ring-black/[0.06] dark:ring-white/[0.06]"
          />
        </div>
      </div>
    </div>
  )
}
