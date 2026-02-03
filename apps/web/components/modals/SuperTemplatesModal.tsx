"use client"

import { X } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { SuperTemplateCard } from "@/components/ui/SuperTemplateCard"
import { SuperTemplatePreview } from "@/components/ui/SuperTemplatePreview"
import { TEMPLATE_CATEGORIES, type Template, type TemplateCategory } from "@/types/templates"

interface SuperTemplatesModalProps {
  onClose: () => void
  onInsertTemplate: (prompt: string) => void
}

export function SuperTemplatesModal({ onClose, onInsertTemplate }: SuperTemplatesModalProps) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState<TemplateCategory>("components")
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)

  // Fetch templates from API
  useEffect(() => {
    async function fetchTemplates() {
      try {
        const res = await fetch("/api/templates/list")
        const data = await res.json()
        setTemplates(data.templates || [])
      } catch (error) {
        console.error("Failed to fetch templates:", error)
        setTemplates([])
      } finally {
        setLoading(false)
      }
    }
    fetchTemplates()
  }, [])

  const getTemplatesByCategory = useCallback(
    (category: TemplateCategory) => templates.filter(t => t.category === category),
    [templates],
  )

  // Filter categories to only show ones with templates
  const categoriesWithTemplates = (Object.keys(TEMPLATE_CATEGORIES) as TemplateCategory[]).filter(
    category => getTemplatesByCategory(category).length > 0,
  )

  const currentTemplates = getTemplatesByCategory(activeCategory)

  // Auto-select first category with templates if current has none
  useEffect(() => {
    if (!loading && categoriesWithTemplates.length > 0 && !categoriesWithTemplates.includes(activeCategory)) {
      setActiveCategory(categoriesWithTemplates[0])
    }
  }, [loading, categoriesWithTemplates, activeCategory])

  // Prevent body scroll when modal is open + handle Escape key
  useEffect(() => {
    document.body.style.overflow = "hidden"

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleEscape)

    return () => {
      document.body.style.overflow = ""
      document.removeEventListener("keydown", handleEscape)
    }
  }, [onClose])

  const handleCardClick = (template: Template) => {
    setSelectedTemplate(template)
  }

  const handleBack = () => {
    setSelectedTemplate(null)
  }

  const handleInsertClick = () => {
    if (selectedTemplate) {
      // Insert JSON that will be auto-detected and converted to supertemplate attachment
      const templateJson = JSON.stringify({
        type: "supertemplate",
        id: selectedTemplate.templateId,
        name: selectedTemplate.name,
        preview: selectedTemplate.previewImage,
      })
      onInsertTemplate(templateJson)
      onClose()
    }
  }

  const handleBackdropClick = () => {
    console.log("[SuperTemplatesModal] Backdrop clicked, calling onClose")
    onClose()
  }

  const handleCloseButtonClick = () => {
    console.log("[SuperTemplatesModal] Close button clicked, calling onClose")
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        onClick={handleBackdropClick}
        tabIndex={-1}
        aria-label="Close modal"
      />

      {/* Modal container */}
      <div className="absolute inset-0 flex items-center justify-center md:p-10 pointer-events-none">
        <div
          className="bg-white dark:bg-[#1a1a1a] shadow-xl pointer-events-auto
            w-full h-full md:h-[calc(100vh-80px)] md:w-[calc(100vw-80px)] md:max-w-6xl
            flex flex-col overflow-hidden
            animate-in fade-in-0 zoom-in-95 duration-200
            md:rounded-2xl"
          onClick={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          {/* Header with close button - always visible */}
          <div className="flex items-center justify-between px-4 py-3 md:px-6 md:py-4 border-b border-black/[0.08] dark:border-white/[0.08]">
            <div className="min-w-0">
              {selectedTemplate ? (
                <h2 className="text-base md:text-lg font-[500] text-black dark:text-white truncate">
                  {selectedTemplate.name}
                </h2>
              ) : (
                <h2 className="text-lg md:text-xl font-[500] text-black dark:text-white">Templates</h2>
              )}
            </div>
            <button
              type="button"
              onClick={handleCloseButtonClick}
              className="p-2 -mr-2 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors rounded-full"
              aria-label="Close"
            >
              <X size={18} className="text-black/60 dark:text-white/60" />
            </button>
          </div>

          {/* Categories */}
          {!selectedTemplate && (
            <div className="border-b border-black/[0.08] dark:border-white/[0.08]">
              {/* Mobile: Compact horizontal scroll */}
              <div className="md:hidden relative">
                <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white dark:from-[#1a1a1a] to-transparent pointer-events-none z-10" />
                <div className="overflow-x-auto scrollbar-hide">
                  <div className="flex gap-1 px-4 py-2">
                    {categoriesWithTemplates.map(category => {
                      const count = getTemplatesByCategory(category).length
                      const isActive = activeCategory === category

                      return (
                        <button
                          key={category}
                          type="button"
                          onClick={() => setActiveCategory(category)}
                          className={`px-3 py-1.5 rounded-full whitespace-nowrap text-sm font-[400] transition-colors flex-shrink-0
                            ${
                              isActive
                                ? "bg-black dark:bg-white text-white dark:text-black"
                                : "text-black/60 dark:text-white/60 active:bg-black/[0.06] dark:active:bg-white/[0.06]"
                            }`}
                        >
                          {TEMPLATE_CATEGORIES[category]}
                          <span className={`ml-1.5 text-xs ${isActive ? "opacity-70" : "opacity-50"}`}>{count}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Desktop: Minimal underline tabs */}
              <div className="hidden md:flex gap-1 px-6 pt-4">
                {categoriesWithTemplates.map(category => {
                  const count = getTemplatesByCategory(category).length
                  const isActive = activeCategory === category

                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setActiveCategory(category)}
                      className={`px-3 py-2 text-sm font-[400] transition-colors
                        ${
                          isActive
                            ? "text-black dark:text-white border-b-2 border-black dark:border-white"
                            : "text-black/40 dark:text-white/40 hover:text-black/60 dark:hover:text-white/60"
                        }`}
                    >
                      {TEMPLATE_CATEGORIES[category]}
                      <span className="ml-1.5 text-xs opacity-50">{count}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            {selectedTemplate ? (
              <SuperTemplatePreview template={selectedTemplate} onBack={handleBack} onInsert={handleInsertClick} />
            ) : loading ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <p className="text-sm font-[300] text-black/40 dark:text-white/40">Loading...</p>
              </div>
            ) : currentTemplates.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <p className="text-sm font-[300] text-black/40 dark:text-white/40">No templates yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
                {currentTemplates.map(template => (
                  <SuperTemplateCard key={template.id} template={template} onClick={() => handleCardClick(template)} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
