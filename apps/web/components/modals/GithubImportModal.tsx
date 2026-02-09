"use client"

import { Loader2, X } from "lucide-react"
import { type FormEvent, useMemo, useState } from "react"
import {
  buildGithubSlugAttempt,
  deriveGithubImportSlug,
  isSupportedGithubRepoInput,
} from "@/features/deployment/lib/github-import-client"

interface GithubImportModalProps {
  onClose: () => void
  onImported: (workspace: string) => void
  orgId?: string | null
}

interface ImportRepoResponse {
  ok?: boolean
  domain?: string
  message?: string
  error?: string
}

const MAX_IMPORT_ATTEMPTS = 3

async function parseImportResponse(response: Response): Promise<ImportRepoResponse> {
  try {
    return (await response.json()) as ImportRepoResponse
  } catch {
    return {}
  }
}

export function GithubImportModal({ onClose, onImported, orgId }: GithubImportModalProps) {
  const [repoUrl, setRepoUrl] = useState("")
  const [branch, setBranch] = useState("")
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmedRepoUrl = repoUrl.trim()
  const branchValue = branch.trim()
  const isValidRepoInput = isSupportedGithubRepoInput(trimmedRepoUrl)
  const slugPreview = useMemo(() => deriveGithubImportSlug(trimmedRepoUrl), [trimmedRepoUrl])

  const submitDisabled = !trimmedRepoUrl || !isValidRepoInput || isImporting

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!trimmedRepoUrl) {
      setError("Repository URL is required.")
      return
    }

    if (!isValidRepoInput) {
      setError('Use a GitHub URL or shorthand like "owner/repo".')
      return
    }

    setError(null)
    setIsImporting(true)

    const baseSlug = slugPreview

    try {
      for (let attempt = 1; attempt <= MAX_IMPORT_ATTEMPTS; attempt += 1) {
        const slug = buildGithubSlugAttempt(baseSlug, attempt)
        const response = await fetch("/api/import-repo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            slug,
            repoUrl: trimmedRepoUrl,
            branch: branchValue || undefined,
            orgId: orgId || undefined,
          }),
        })

        const data = await parseImportResponse(response)

        if (response.ok && data.ok && data.domain) {
          onImported(data.domain)
          return
        }

        if (data.error === "SLUG_TAKEN" && attempt < MAX_IMPORT_ATTEMPTS) {
          continue
        }

        setError(data.message || "Failed to import repository. Please try again.")
        return
      }

      setError("Could not allocate a unique workspace name. Please retry.")
    } catch {
      setError("Network error while importing. Please check your connection and try again.")
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4"
      onMouseDown={event => {
        if (!isImporting && event.target === event.currentTarget) {
          onClose()
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="github-import-title"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#1a1a1a] shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/10 dark:border-white/10">
          <div>
            <h2 id="github-import-title" className="text-base font-semibold text-black dark:text-white">
              Open Project from GitHub
            </h2>
            <p className="text-xs text-black/50 dark:text-white/50 mt-1">
              We will create a new workspace from this repository.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isImporting}
            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-40"
            aria-label="Close"
          >
            <X size={18} className="text-black/60 dark:text-white/60" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="github-repo-url" className="text-sm font-medium text-black/80 dark:text-white/80">
              Repository
            </label>
            <input
              id="github-repo-url"
              type="text"
              value={repoUrl}
              onChange={event => setRepoUrl(event.target.value)}
              placeholder="https://github.com/owner/repo or owner/repo"
              disabled={isImporting}
              className="w-full h-11 px-3 rounded-lg border border-black/15 dark:border-white/15 bg-transparent text-sm text-black dark:text-white placeholder:text-black/35 dark:placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-black/15 dark:focus:ring-white/20 disabled:opacity-60"
            />
            {trimmedRepoUrl && !isValidRepoInput && (
              <p className="text-xs text-red-600 dark:text-red-400">Use a valid GitHub URL or `owner/repo` format.</p>
            )}
            {trimmedRepoUrl && isValidRepoInput && (
              <p className="text-xs text-black/50 dark:text-white/50">
                Workspace slug preview: <span className="font-mono">{slugPreview}</span>
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="github-branch" className="text-sm font-medium text-black/80 dark:text-white/80">
              Branch (optional)
            </label>
            <input
              id="github-branch"
              type="text"
              value={branch}
              onChange={event => setBranch(event.target.value)}
              placeholder="main"
              disabled={isImporting}
              className="w-full h-11 px-3 rounded-lg border border-black/15 dark:border-white/15 bg-transparent text-sm text-black dark:text-white placeholder:text-black/35 dark:placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-black/15 dark:focus:ring-white/20 disabled:opacity-60"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-900/20 px-3 py-2">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isImporting}
              className="h-10 px-4 rounded-lg border border-black/15 dark:border-white/15 text-sm text-black/70 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitDisabled}
              className="h-10 px-4 rounded-lg bg-black dark:bg-white text-white dark:text-black text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all inline-flex items-center gap-2"
            >
              {isImporting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Importing...
                </>
              ) : (
                "Import and Open"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
