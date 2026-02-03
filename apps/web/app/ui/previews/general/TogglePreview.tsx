"use client"

import { useState } from "react"
import { Toggle } from "@/components/ui/Toggle"

export function TogglePreview() {
  const [enabled1, setEnabled1] = useState(false)
  const [enabled2, setEnabled2] = useState(true)
  const [enabled3, setEnabled3] = useState(false)

  return (
    <div className="space-y-8">
      {/* Basic Toggle */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Basic Toggle</h3>
        <div className="flex items-center gap-3">
          <Toggle checked={enabled1} onChange={setEnabled1} aria-label="Toggle notifications" />
          <span className="text-sm text-black/70 dark:text-white/70">{enabled1 ? "Enabled" : "Disabled"}</span>
        </div>
      </section>

      {/* Sizes */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Sizes</h3>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Toggle checked={enabled2} onChange={setEnabled2} size="sm" aria-label="Small toggle" />
            <span className="text-sm text-black/70 dark:text-white/70">Small</span>
          </div>
          <div className="flex items-center gap-3">
            <Toggle checked={enabled2} onChange={setEnabled2} size="md" aria-label="Medium toggle" />
            <span className="text-sm text-black/70 dark:text-white/70">Medium (responsive)</span>
          </div>
        </div>
      </section>

      {/* Disabled */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Disabled</h3>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Toggle checked={false} onChange={() => {}} disabled aria-label="Disabled off toggle" />
            <span className="text-sm text-black/40 dark:text-white/40">Disabled (off)</span>
          </div>
          <div className="flex items-center gap-3">
            <Toggle checked={true} onChange={() => {}} disabled aria-label="Disabled on toggle" />
            <span className="text-sm text-black/40 dark:text-white/40">Disabled (on)</span>
          </div>
        </div>
      </section>

      {/* In Context */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Settings Example</h3>
        <div className="p-4 bg-white dark:bg-zinc-900 rounded-lg border border-black/10 dark:border-white/10 max-w-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-black dark:text-white text-sm">Dark Mode</div>
              <div className="text-xs text-black/60 dark:text-white/60">Use dark theme</div>
            </div>
            <Toggle checked={enabled3} onChange={setEnabled3} aria-label="Toggle dark mode" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-black dark:text-white text-sm">Notifications</div>
              <div className="text-xs text-black/60 dark:text-white/60">Receive email updates</div>
            </div>
            <Toggle checked={enabled1} onChange={setEnabled1} aria-label="Toggle notifications" />
          </div>
        </div>
      </section>
    </div>
  )
}
