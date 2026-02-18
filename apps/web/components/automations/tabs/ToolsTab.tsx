import { useQuery } from "@tanstack/react-query"
import { ChevronDown, X } from "lucide-react"
import { useState } from "react"
import type { SkillItem } from "../types"

interface ToolsTabProps {
  skills: string[]
  onSkillsChange: (skills: string[]) => void
}

export function ToolsTab({ skills, onSkillsChange }: ToolsTabProps) {
  const [open, setOpen] = useState(false)

  const { data } = useQuery<{ skills: SkillItem[] }>({
    queryKey: ["skills", "list"],
    queryFn: async () => {
      const res = await fetch("/api/skills/list")
      if (!res.ok) throw new Error("Failed to fetch skills")
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })
  const available = data?.skills ?? []

  const toggle = (id: string) => {
    onSkillsChange(skills.includes(id) ? skills.filter(s => s !== id) : [...skills, id])
  }

  const remove = (id: string) => {
    onSkillsChange(skills.filter(s => s !== id))
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-black dark:text-white">Skills</div>

        {/* Dropdown trigger */}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="w-full h-9 px-3 rounded-lg text-sm bg-black/[0.04] dark:bg-white/[0.06] text-black dark:text-white flex items-center justify-between hover:bg-black/[0.07] dark:hover:bg-white/[0.09] transition-colors"
        >
          <span className="text-black/50 dark:text-white/50">
            {skills.length > 0 ? `${skills.length} selected` : "None"}
          </span>
          <ChevronDown
            size={16}
            className={`text-black/40 dark:text-white/40 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>

        {/* Dropdown list */}
        {open && available.length > 0 && (
          <div className="max-h-48 overflow-auto rounded-xl bg-white dark:bg-neutral-900 border border-black/[0.08] dark:border-white/[0.08]">
            {available.map(skill => (
              <SkillRow key={skill.id} skill={skill} selected={skills.includes(skill.id)} onToggle={toggle} />
            ))}
          </div>
        )}

        {/* Selected chips */}
        {skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {skills.map(id => (
              <SkillChip
                key={id}
                id={id}
                label={available.find(s => s.id === id)?.displayName ?? id}
                onRemove={remove}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SkillRow({
  skill,
  selected,
  onToggle,
}: {
  skill: SkillItem
  selected: boolean
  onToggle: (id: string) => void
}) {
  return (
    <label className="w-full px-3 py-2 text-left text-sm hover:bg-black/[0.04] dark:hover:bg-white/[0.06] flex items-center gap-2 transition-colors cursor-pointer">
      <input type="checkbox" checked={selected} onChange={() => onToggle(skill.id)} className="sr-only" />
      <div
        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
          selected ? "bg-black dark:bg-white border-black dark:border-white" : "border-black/20 dark:border-white/20"
        }`}
      >
        {selected && (
          <svg className="w-3 h-3 text-white dark:text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <div className="min-w-0">
        <span className="text-sm text-black dark:text-white">{skill.displayName}</span>
        {skill.description && (
          <p className="text-[11px] text-black/40 dark:text-white/40 truncate">{skill.description}</p>
        )}
      </div>
    </label>
  )
}

function SkillChip({ id, label, onRemove }: { id: string; label: string; onRemove: (id: string) => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-xl bg-black/[0.04] dark:bg-white/[0.06] text-black/70 dark:text-white/70">
      {label}
      <button
        type="button"
        onClick={() => onRemove(id)}
        className="hover:text-black dark:hover:text-white transition-colors"
      >
        <X size={12} />
      </button>
    </span>
  )
}
