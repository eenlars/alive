"use client"

import { AlertTriangle, ChevronDown, ChevronUp, ExternalLink } from "lucide-react"
import { WorkspaceSwitcher } from "@/components/workspace/WorkspaceSwitcher"
import { WorktreeSwitcher } from "@/components/workspace/WorktreeSwitcher"

interface WorkspaceInfoBarProps {
  workspace: string | null
  worktree: string | null
  mounted: boolean
  isTerminal: boolean
  isSuperadminWorkspace: boolean
  onSelectSite: () => void
  onNewTabGroup: () => void
  onMobilePreview: () => void
  onSelectWorktree: (worktree: string | null) => void
  worktreeModalOpen?: boolean
  onWorktreeModalOpenChange?: (open: boolean) => void
  onToggleTabs?: () => void
  showTabsToggle?: boolean
  tabsExpanded?: boolean
}

export function WorkspaceInfoBar({
  workspace,
  worktree,
  mounted,
  isTerminal,
  isSuperadminWorkspace,
  onSelectSite,
  onMobilePreview,
  onSelectWorktree,
  worktreeModalOpen,
  onWorktreeModalOpenChange,
  onToggleTabs,
  showTabsToggle = false,
  tabsExpanded = false,
}: WorkspaceInfoBarProps) {
  // Show warning state only when mounted AND no workspace - avoids hydration mismatch
  const showWarning = mounted && !workspace

  return (
    <div
      className={`flex-shrink-0 border-b ${showWarning ? "border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-900/20" : "border-black/[0.04] dark:border-white/[0.04]"}`}
      suppressHydrationWarning
    >
      <div className="px-3 md:px-6 py-2 md:py-2.5 mx-auto w-full md:max-w-2xl">
        {/* Workspace info bar */}
        <div className="flex items-center justify-between gap-2">
          {/* Left: site name */}
          <div className="flex items-center min-w-0 flex-1" data-testid="workspace-section">
            {showWarning && (
              <AlertTriangle
                size={14}
                strokeWidth={2}
                className="text-amber-500 dark:text-amber-400 mr-1.5 flex-shrink-0"
              />
            )}
            {isTerminal ? (
              <div className="flex items-center min-w-0">
                <WorkspaceSwitcher currentWorkspace={workspace} onOpenSettings={onSelectSite} />
                {!isSuperadminWorkspace && (
                  <WorktreeSwitcher
                    workspace={workspace}
                    currentWorktree={worktree}
                    onChange={onSelectWorktree}
                    isOpen={worktreeModalOpen}
                    onOpenChange={onWorktreeModalOpenChange}
                  />
                )}
              </div>
            ) : showWarning ? (
              <button
                type="button"
                onClick={onSelectSite}
                className="text-sm font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 active:scale-95 transition-all"
              >
                Select a site to start
              </button>
            ) : (
              <span className="text-xs md:text-sm font-medium text-black/70 dark:text-white/70 truncate">
                {workspace || "Loading..."}
              </span>
            )}
          </div>

          {/* Right: action buttons */}
          {workspace && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Mobile/Tablet: Preview button - opens fullscreen overlay. Hidden on lg+ where side panel is used */}
              {!isSuperadminWorkspace && (
                <button
                  type="button"
                  onClick={onMobilePreview}
                  className="lg:hidden inline-flex items-center justify-center h-7 md:h-8 px-3 text-xs font-medium text-white dark:text-black bg-black dark:bg-white hover:brightness-[0.85] active:brightness-75 active:scale-95 rounded-full transition-all duration-150"
                >
                  Preview
                </button>
              )}

              {/* Desktop: Open in new tab */}
              {!isSuperadminWorkspace && (
                <a
                  href={`https://${workspace}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden sm:inline-flex items-center gap-1 h-7 px-2.5 text-xs font-medium text-black/40 dark:text-white/40 hover:text-black/70 dark:hover:text-white/70 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] active:scale-95 rounded-full transition-all duration-150"
                >
                  <ExternalLink size={12} strokeWidth={2} />
                  <span>open</span>
                </a>
              )}
              {showTabsToggle && onToggleTabs && (
                <button
                  type="button"
                  onClick={onToggleTabs}
                  data-testid="toggle-tabs-button"
                  className={`inline-flex items-center justify-center size-7 rounded-full transition-all duration-150 ${
                    tabsExpanded
                      ? "text-black/70 dark:text-white/70 bg-black/[0.06] dark:bg-white/[0.06]"
                      : "text-black/40 dark:text-white/40 hover:text-black/70 dark:hover:text-white/70 hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
                  }`}
                  title={tabsExpanded ? "Hide tabs" : "Show tabs"}
                >
                  {tabsExpanded ? <ChevronUp size={14} strokeWidth={2} /> : <ChevronDown size={14} strokeWidth={2} />}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
