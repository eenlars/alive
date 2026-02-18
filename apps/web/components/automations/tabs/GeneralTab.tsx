import { CLAUDE_MODELS, type ClaudeModel, getModelDisplayName } from "@webalive/shared"
import { useState } from "react"
import type { Site } from "@/lib/hooks/useSettingsQueries"

const MODEL_OPTIONS: { label: string; value: ClaudeModel }[] = Object.values(CLAUDE_MODELS).map(id => ({
  label: getModelDisplayName(id),
  value: id,
}))

const selectChevron = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 12px center",
  paddingRight: "36px",
} as const

interface GeneralTabProps {
  title: string
  onTitleChange: (v: string) => void
  siteId: string
  siteSearch: string
  onSiteSelect: (id: string, hostname: string) => void
  onSiteSearchChange: (v: string) => void
  sites: Site[]
  model: string
  onModelChange: (v: string) => void
  timeoutSeconds: string
  onTimeoutChange: (v: string) => void
}

export function GeneralTab({
  title,
  onTitleChange,
  siteId,
  siteSearch,
  onSiteSelect,
  onSiteSearchChange,
  sites,
  model,
  onModelChange,
  timeoutSeconds,
  onTimeoutChange,
}: GeneralTabProps) {
  const [siteDropdownOpen, setSiteDropdownOpen] = useState(false)
  const filteredSites = sites.filter(s => s.hostname.toLowerCase().includes(siteSearch.toLowerCase()))

  return (
    <div className="space-y-3">
      {/* Title */}
      <Field label="Title" htmlFor="auto-title">
        <input
          id="auto-title"
          type="text"
          value={title}
          onChange={e => onTitleChange(e.target.value)}
          placeholder="Summary of AI news"
          autoComplete="off"
          className={inputClass}
        />
      </Field>

      {/* Website */}
      <Field label="Website" htmlFor="auto-site">
        <div className="relative">
          <input
            id="auto-site"
            type="text"
            value={siteSearch}
            onChange={e => {
              onSiteSearchChange(e.target.value)
              setSiteDropdownOpen(true)
              if (!e.target.value) onSiteSelect("", "")
            }}
            onFocus={() => setSiteDropdownOpen(true)}
            onBlur={() => setTimeout(() => setSiteDropdownOpen(false), 150)}
            placeholder="Select website..."
            autoComplete="off"
            className={inputClass}
          />
          {siteDropdownOpen && filteredSites.length > 0 && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1.5 max-h-48 overflow-auto rounded-2xl bg-white dark:bg-neutral-900 border border-black/[0.08] dark:border-white/[0.08] shadow-xl ring-1 ring-black/[0.04] dark:ring-white/[0.04] animate-in fade-in slide-in-from-bottom-2 duration-150">
              {filteredSites.slice(0, 8).map(site => (
                <button
                  key={site.id}
                  type="button"
                  onMouseDown={e => {
                    e.preventDefault()
                    onSiteSelect(site.id, site.hostname)
                    setSiteDropdownOpen(false)
                  }}
                  className={`w-full px-4 py-2.5 text-left text-sm rounded-xl hover:bg-black/[0.04] dark:hover:bg-white/[0.06] active:bg-black/[0.07] dark:active:bg-white/[0.09] transition-colors ${
                    siteId === site.id ? "bg-black/[0.04] dark:bg-white/[0.06]" : ""
                  }`}
                >
                  {site.hostname}
                </button>
              ))}
            </div>
          )}
        </div>
      </Field>

      {/* Model & Timeout */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Model" htmlFor="auto-model" muted>
          <select
            id="auto-model"
            value={model}
            onChange={e => onModelChange(e.target.value)}
            className={`${inputClass} cursor-pointer appearance-none`}
            style={selectChevron}
          >
            <option value="">Default</option>
            {MODEL_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Timeout (s)" htmlFor="auto-timeout" muted>
          <input
            id="auto-timeout"
            type="number"
            min={10}
            max={3600}
            value={timeoutSeconds}
            onChange={e => onTimeoutChange(e.target.value)}
            placeholder="300"
            className={inputClass}
          />
        </Field>
      </div>
    </div>
  )
}

// ── Shared styles ──

const inputClass =
  "w-full h-9 px-3 rounded-lg text-sm bg-black/[0.04] dark:bg-white/[0.06] text-black dark:text-white placeholder:text-black/30 dark:placeholder:text-white/30 border-0 focus:outline-none focus:ring-1 focus:ring-black/[0.08] dark:focus:ring-white/[0.08] transition-all"

function Field({
  label,
  htmlFor,
  muted,
  children,
}: {
  label: string
  htmlFor: string
  muted?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className={`text-xs font-medium ${muted ? "text-black/60 dark:text-white/60" : "text-black dark:text-white"}`}
      >
        {label}
      </label>
      {children}
    </div>
  )
}
