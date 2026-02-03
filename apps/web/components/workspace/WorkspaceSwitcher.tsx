"use client"

import { ChevronRight } from "lucide-react"

interface WorkspaceSwitcherProps {
  currentWorkspace: string | null
  onOpenSettings: () => void
}

export function WorkspaceSwitcher({ currentWorkspace, onOpenSettings }: WorkspaceSwitcherProps) {
  return (
    <button
      type="button"
      onClick={onOpenSettings}
      className={`ml-3 font-diatype-mono font-medium hover:text-black dark:hover:text-white transition-colors flex items-center gap-1 ${
        currentWorkspace ? "text-black/80 dark:text-white/80" : "text-black/60 dark:text-white/60"
      }`}
      data-testid="workspace-switcher"
    >
      <span data-testid="workspace-switcher-text">{currentWorkspace || "select"}</span>
      <ChevronRight size={10} />
    </button>
  )
}
