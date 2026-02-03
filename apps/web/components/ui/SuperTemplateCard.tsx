"use client"

import type { Template } from "@/types/templates"

interface SuperTemplateCardProps {
  template: Template
  onClick: () => void
}

export function SuperTemplateCard({ template, onClick }: SuperTemplateCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative bg-white dark:bg-neutral-900 rounded-xl overflow-hidden
        ring-1 ring-black/[0.06] dark:ring-white/[0.06]
        hover:ring-black/[0.12] dark:hover:ring-white/[0.12]
        transition-all duration-150 hover:shadow-lg
        text-left w-full"
    >
      {/* Screenshot Preview */}
      <div className="relative aspect-[16/10] bg-black/[0.04] dark:bg-white/[0.04] overflow-hidden">
        <img
          src={template.previewImage}
          alt={`${template.name} preview`}
          className="absolute inset-0 w-full h-full object-cover"
        />
      </div>

      {/* Content - compact on mobile */}
      <div className="p-3 md:p-4 space-y-1.5">
        {/* Title + Time inline */}
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm md:text-base font-[500] text-black dark:text-white truncate">{template.name}</h3>
          <span className="text-[11px] font-[300] text-black/40 dark:text-white/40 flex-shrink-0">
            {template.estimatedTime}
          </span>
        </div>

        {/* Description - hidden on mobile for compactness */}
        <p className="hidden md:block text-sm font-[300] text-black/50 dark:text-white/50 line-clamp-2">
          {template.description}
        </p>

        {/* Tags - fewer on mobile */}
        <div className="flex flex-wrap gap-1 pt-0.5">
          {template.tags.slice(0, 2).map(tag => (
            <span
              key={tag}
              className="text-[11px] font-[300] px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-black/50 dark:text-white/50"
            >
              {tag}
            </span>
          ))}
          {template.tags.length > 2 && (
            <span className="text-[11px] font-[300] text-black/30 dark:text-white/30">+{template.tags.length - 2}</span>
          )}
        </div>
      </div>
    </button>
  )
}
