"use client"

import { Activity, Code, FolderOpen, Globe, Terminal } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { trackSandboxModeChanged } from "@/lib/analytics/events"
import { useFeatureFlag } from "@/lib/stores/featureFlagStore"
import type { PanelView } from "../../lib/sandbox-context"

interface PanelViewMenuProps {
  currentView: PanelView
  onViewChange: (view: PanelView) => void
  isSuperadmin?: boolean
}

const VIEW_OPTIONS: { view: PanelView; label: string; icon: typeof Globe; superadminOnly?: boolean }[] = [
  { view: "site", label: "Preview", icon: Globe },
  { view: "code", label: "Code", icon: Code },
  { view: "drive", label: "Drive", icon: FolderOpen },
  { view: "terminal", label: "Terminal", icon: Terminal },
  { view: "events", label: "Events", icon: Activity, superadminOnly: true },
]

// Check if we're on mobile (client-side only)
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  return isMobile
}

export function PanelViewMenu({ currentView, onViewChange, isSuperadmin }: PanelViewMenuProps) {
  const isMobile = useIsMobile()
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const driveEnabled = useFeatureFlag("DRIVE")

  // Get available views based on workspace type and feature flags
  const availableViews = VIEW_OPTIONS.filter(o => {
    if (isSuperadmin && (o.view === "site" || o.view === "drive")) return false
    if (o.view === "drive" && !driveEnabled) return false
    if (o.superadminOnly && !isSuperadmin) return false
    return true
  })

  // Redirect when current view is no longer available (flag toggled off, mobile, superadmin)
  useEffect(() => {
    if (!availableViews.some(v => v.view === currentView)) {
      onViewChange(isMobile ? "site" : (availableViews[0]?.view ?? "code"))
    }
  }, [availableViews, currentView, isMobile, onViewChange])

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return

    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen])

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && isOpen) {
        setIsOpen(false)
        return
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen])

  const handleSelect = (view: PanelView) => {
    trackSandboxModeChanged(view)
    onViewChange(view)
    setIsOpen(false)
  }

  // Don't show menu on mobile - only site preview available
  if (isMobile) {
    return null
  }

  const CurrentIcon = VIEW_OPTIONS.find(o => o.view === currentView)?.icon ?? Globe

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`p-1.5 rounded transition-colors ${
          isOpen
            ? "bg-black/[0.06] dark:bg-white/[0.08] text-neutral-800 dark:text-neutral-200"
            : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
        }`}
        title="Switch view"
        aria-label="Switch view"
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <CurrentIcon size={14} strokeWidth={1.5} />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute top-full right-0 mt-1.5 w-32 bg-white dark:bg-[#1a1a1a] border border-black/[0.08] dark:border-white/[0.08] rounded-lg shadow-xl shadow-black/10 dark:shadow-black/40 z-50 overflow-hidden"
        >
          <div className="py-1">
            {availableViews.map(({ view, label, icon: Icon }) => {
              const isActive = currentView === view
              return (
                <button
                  key={view}
                  type="button"
                  role="menuitem"
                  onClick={() => handleSelect(view)}
                  className={`w-full px-3 py-1.5 text-left text-[13px] flex items-center gap-2 transition-colors ${
                    isActive
                      ? "bg-black/[0.04] dark:bg-white/[0.06] text-black dark:text-white"
                      : "text-neutral-500 dark:text-neutral-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] hover:text-neutral-800 dark:hover:text-neutral-200"
                  }`}
                >
                  <Icon
                    size={14}
                    strokeWidth={1.5}
                    className={isActive ? "text-black dark:text-white" : "text-neutral-400 dark:text-neutral-500"}
                  />
                  <span className="flex-1">{label}</span>
                  {isActive && <div className="w-1 h-1 rounded-full bg-emerald-500" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/** @deprecated Use PanelViewMenu instead */
export { PanelViewMenu as SandboxModeMenu }
