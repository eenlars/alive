"use client"

import { Globe, Sparkles, User } from "lucide-react"
import { useEffect, useRef } from "react"
import type { Skill } from "@/lib/stores/skillsStore"

interface SkillMentionPopupProps {
  filteredSkills: Skill[]
  selectedIndex: number
  onSelect: (skill: Skill) => void
  onDismiss: () => void
  onHover: (index: number) => void
  query: string
}

/**
 * Highlight the matching portion of text in purple.
 */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>

  const lower = text.toLowerCase()
  const start = lower.indexOf(query.toLowerCase())
  if (start === -1) return <>{text}</>

  return (
    <>
      {text.slice(0, start)}
      <span className="text-purple-600 dark:text-purple-400 font-semibold">
        {text.slice(start, start + query.length)}
      </span>
      {text.slice(start + query.length)}
    </>
  )
}

/**
 * SkillMentionPopup - Premium @mention autocomplete for skills.
 *
 * Appears above the chat input when the user types @.
 * Full-width, smooth animation, match highlighting, keyboard navigation.
 */
export function SkillMentionPopup({
  filteredSkills,
  selectedIndex,
  onSelect,
  onDismiss,
  onHover,
  query,
}: SkillMentionPopupProps) {
  const listRef = useRef<HTMLDivElement>(null)

  // Auto-scroll selected item into view
  useEffect(() => {
    const container = listRef.current
    if (!container) return
    const items = container.querySelectorAll("[data-skill-item]")
    const selected = items[selectedIndex]
    if (selected instanceof HTMLElement) {
      selected.scrollIntoView({ block: "nearest" })
    }
  }, [selectedIndex])

  // Empty state
  if (filteredSkills.length === 0) {
    return (
      <>
        {/* Backdrop - catches outside clicks */}
        <button
          type="button"
          className="fixed inset-0 z-10 bg-transparent border-0 p-0 cursor-default"
          onClick={onDismiss}
          onKeyDown={e => e.key === "Escape" && onDismiss()}
          aria-label="Close skill suggestions"
          tabIndex={-1}
        />

        <div className="absolute bottom-full left-0 right-0 mb-2 z-20 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="bg-white dark:bg-neutral-900 border border-black/[0.08] dark:border-white/[0.08] rounded-2xl shadow-xl ring-1 ring-black/[0.04] dark:ring-white/[0.04] overflow-hidden">
            <div className="px-4 py-5 text-center">
              <div className="text-[12px] text-black/35 dark:text-white/35">
                {query ? (
                  <>
                    No skills match <span className="font-medium text-black/50 dark:text-white/50">@{query}</span>
                  </>
                ) : (
                  "No skills available"
                )}
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      {/* Backdrop - catches outside clicks */}
      <button
        type="button"
        className="fixed inset-0 z-10 bg-transparent border-0 p-0 cursor-default"
        onClick={onDismiss}
        onKeyDown={e => e.key === "Escape" && onDismiss()}
        aria-label="Close skill suggestions"
        tabIndex={-1}
      />

      {/* Popup */}
      <div className="absolute bottom-full left-0 right-0 mb-2 z-20 animate-in fade-in slide-in-from-bottom-2 duration-150">
        <div className="bg-white dark:bg-neutral-900 border border-black/[0.08] dark:border-white/[0.08] rounded-2xl shadow-xl ring-1 ring-black/[0.04] dark:ring-white/[0.04] overflow-hidden">
          {/* Header */}
          <div className="px-4 pt-3 pb-1.5">
            <div className="flex items-center gap-1.5">
              <Sparkles className="size-3 text-purple-500/60" />
              <span className="text-[10px] font-semibold text-black/30 dark:text-white/30 uppercase tracking-widest">
                Skills
              </span>
            </div>
          </div>

          {/* Skill list */}
          <div
            ref={listRef}
            role="listbox"
            id="skill-mention-listbox"
            aria-label="Skill suggestions"
            className="max-h-64 overflow-y-auto px-1.5 pb-1.5"
          >
            {filteredSkills.map((skill, index) => (
              <button
                key={skill.id}
                type="button"
                role="option"
                id={`skill-option-${skill.id}`}
                aria-selected={index === selectedIndex}
                data-skill-item
                onClick={() => onSelect(skill)}
                onMouseEnter={() => onHover(index)}
                className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors duration-100 ${
                  index === selectedIndex
                    ? "bg-black/[0.05] dark:bg-white/[0.07]"
                    : "hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Skill icon */}
                  <div
                    className={`size-8 flex items-center justify-center rounded-lg shrink-0 transition-colors duration-100 ${
                      index === selectedIndex
                        ? "bg-purple-500/15 dark:bg-purple-400/15"
                        : "bg-purple-500/[0.08] dark:bg-purple-400/[0.08]"
                    }`}
                  >
                    {skill.source === "superadmin" ? (
                      <Globe className="size-4 text-purple-600 dark:text-purple-400" />
                    ) : (
                      <User className="size-4 text-purple-600 dark:text-purple-400" />
                    )}
                  </div>

                  {/* Skill info */}
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-black/80 dark:text-white/80 truncate">
                      <HighlightMatch text={skill.displayName} query={query} />
                    </div>
                    <div className="text-[11px] text-black/35 dark:text-white/35 truncate leading-relaxed">
                      {skill.description}
                    </div>
                  </div>

                  {/* Keyboard hint on selected item */}
                  {index === selectedIndex && (
                    <div className="shrink-0 flex items-center gap-1">
                      <kbd className="text-[9px] font-medium text-black/25 dark:text-white/25 bg-black/[0.04] dark:bg-white/[0.06] px-1.5 py-0.5 rounded">
                        enter
                      </kbd>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
