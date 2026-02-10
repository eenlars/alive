"use client"

interface ChatEmptyStateProps {
  workspace: string | null
  totalDomainCount: number
  isLoading?: boolean
  onTemplatesClick: () => void
  onImportGithub?: () => void
  onSelectSite?: () => void
}

export function ChatEmptyState({
  workspace,
  totalDomainCount,
  isLoading,
  onTemplatesClick,
  onImportGithub,
  onSelectSite,
}: ChatEmptyStateProps) {
  // Show nothing while loading organizations - prevents flash of "no sites" message
  if (isLoading && !workspace) {
    return null
  }

  return (
    <div className="flex items-start justify-center h-full pt-32">
      <div className="max-w-md text-center space-y-6">
        {workspace ? (
          <>
            <p className="text-lg text-black/80 dark:text-white/80 font-medium">What's next?</p>
            <div className="pt-2">
              <button
                type="button"
                onClick={onTemplatesClick}
                className="h-10 px-5 rounded-xl bg-black/[0.05] dark:bg-white/[0.05] hover:bg-black/[0.08] dark:hover:bg-white/[0.08] active:bg-black/[0.12] dark:active:bg-white/[0.12] text-sm font-medium text-black/80 dark:text-white/80 transition-all duration-150 active:scale-95"
              >
                Browse templates
              </button>
            </div>
          </>
        ) : totalDomainCount === 0 ? (
          <>
            <p className="text-lg text-black/80 dark:text-white/80 font-medium">No project selected yet.</p>
            <p className="text-sm text-black/50 dark:text-white/50">Start from GitHub or launch a template.</p>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
              {onImportGithub && (
                <button
                  type="button"
                  onClick={onImportGithub}
                  className="inline-flex items-center justify-center h-10 px-5 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-medium hover:brightness-[0.85] active:brightness-75 active:scale-95 transition-all duration-150"
                >
                  Open from GitHub
                </button>
              )}
              <a
                href="/deploy"
                className="inline-flex items-center justify-center h-10 px-5 rounded-xl bg-black/[0.05] dark:bg-white/[0.05] hover:bg-black/[0.08] dark:hover:bg-white/[0.08] active:bg-black/[0.12] dark:active:bg-white/[0.12] text-sm font-medium text-black/80 dark:text-white/80 transition-all duration-150 active:scale-95"
              >
                Launch a template
              </a>
            </div>
          </>
        ) : (
          <>
            <p className="text-lg text-black/80 dark:text-white/80 font-medium">No project selected.</p>
            <p className="text-sm text-black/50 dark:text-white/50">Pick one to continue, or import a new repo.</p>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
              {onSelectSite && (
                <button
                  type="button"
                  onClick={onSelectSite}
                  className="inline-flex items-center justify-center h-10 px-5 rounded-xl bg-black/[0.05] dark:bg-white/[0.05] hover:bg-black/[0.08] dark:hover:bg-white/[0.08] active:bg-black/[0.12] dark:active:bg-white/[0.12] text-sm font-medium text-black/80 dark:text-white/80 transition-all duration-150 active:scale-95"
                >
                  Select a site
                </button>
              )}
              {onImportGithub && (
                <button
                  type="button"
                  onClick={onImportGithub}
                  className="inline-flex items-center justify-center h-10 px-5 rounded-xl bg-black dark:bg-white text-white dark:text-black text-sm font-medium hover:brightness-[0.85] active:brightness-75 active:scale-95 transition-all duration-150"
                >
                  Open from GitHub
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
