"use client"

import { ChevronDown, RefreshCcw } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Modal } from "@/components/ui/Modal"
import { buildWorkspaceKey, validateWorktreeSlug } from "@/features/workspace/lib/worktree-utils"
import { ApiError, delly, getty, postty } from "@/lib/api/api-client"
import { validateRequest } from "@/lib/api/schemas"

interface WorktreeSwitcherProps {
  workspace: string | null
  currentWorktree: string | null
  onChange: (worktree: string | null) => void
  isOpen?: boolean
  onOpenChange?: (open: boolean) => void
}

interface WorktreeListItem {
  slug: string
  pathRelative: string
  branch: string | null
  head: string | null
}

export function WorktreeSwitcher({
  workspace,
  currentWorktree,
  onChange,
  isOpen,
  onOpenChange,
}: WorktreeSwitcherProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [worktrees, setWorktrees] = useState<WorktreeListItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [removingSlug, setRemovingSlug] = useState<string | null>(null)

  const [slug, setSlug] = useState("")
  const [branch, setBranch] = useState("")
  const [from, setFrom] = useState("")
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const isControlled = typeof isOpen === "boolean"
  const modalOpen = isControlled ? isOpen : internalOpen
  const setModalOpen = useCallback(
    (value: boolean) => {
      if (isControlled) {
        onOpenChange?.(value)
        return
      }
      setInternalOpen(value)
      onOpenChange?.(value)
    },
    [isControlled, onOpenChange],
  )

  const workspaceKey = useMemo(() => buildWorkspaceKey(workspace, currentWorktree), [workspace, currentWorktree])

  const loadWorktrees = useCallback(async () => {
    if (!workspace) return
    setLoading(true)
    setError(null)
    try {
      const data = await getty("worktrees", undefined, `/api/worktrees?workspace=${encodeURIComponent(workspace)}`)
      setWorktrees(data.worktrees)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError("Failed to load worktrees.")
      }
    } finally {
      setLoading(false)
    }
  }, [workspace])

  useEffect(() => {
    if (modalOpen) {
      void loadWorktrees()
    }
  }, [modalOpen, loadWorktrees])

  const handleSelect = (target: string | null) => {
    onChange(target)
    setModalOpen(false)
  }

  const handleRemove = async (target: string) => {
    if (!workspace) return
    if (!confirm(`Remove worktree "${target}"? This keeps the branch by default.`)) {
      return
    }

    setRemoveError(null)
    setRemovingSlug(target)

    try {
      await delly(
        "worktrees/delete",
        undefined,
        `/api/worktrees?workspace=${encodeURIComponent(workspace)}&slug=${encodeURIComponent(target)}`,
      )
      setWorktrees(prev => prev.filter(item => item.slug !== target))
      if (currentWorktree === target) {
        onChange(null)
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setRemoveError(err.message)
      } else {
        setRemoveError("Failed to remove worktree.")
      }
    } finally {
      setRemovingSlug(null)
    }
  }

  const handleCreate = async () => {
    if (!workspace) return
    setCreateError(null)

    const trimmedSlug = slug.trim()
    let normalizedSlug: string | undefined
    if (trimmedSlug.length > 0) {
      const validation = validateWorktreeSlug(trimmedSlug)
      if (!validation.valid) {
        setCreateError(validation.reason)
        return
      }
      normalizedSlug = validation.slug
    }

    const trimmedBranch = branch.trim()
    const trimmedFrom = from.trim()

    setCreating(true)
    try {
      const payload = validateRequest("worktrees/create", {
        workspace,
        slug: normalizedSlug,
        branch: trimmedBranch.length > 0 ? trimmedBranch : undefined,
        from: trimmedFrom.length > 0 ? trimmedFrom : undefined,
      })

      const response = await postty("worktrees/create", payload, undefined, "/api/worktrees")
      setWorktrees(prev => {
        const existing = prev.filter(item => item.slug !== response.slug)
        return [
          ...existing,
          {
            slug: response.slug,
            pathRelative: response.slug,
            branch: response.branch,
            head: null,
          },
        ].sort((a, b) => a.slug.localeCompare(b.slug))
      })
      setSlug("")
      setBranch("")
      setFrom("")
      onChange(response.slug)
      setModalOpen(false)
    } catch (err) {
      if (err instanceof ApiError) {
        setCreateError(err.message)
      } else {
        setCreateError("Failed to create worktree.")
      }
    } finally {
      setCreating(false)
    }
  }

  if (!workspace) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="ml-2 text-[11px] font-medium text-black/50 dark:text-white/50 hover:text-black/80 dark:hover:text-white/80 transition-colors inline-flex items-center gap-1.5 px-2 py-1 rounded-full border border-black/[0.08] dark:border-white/[0.08] hover:border-black/20 dark:hover:border-white/20"
        title={workspaceKey ? `Workspace key: ${workspaceKey}` : "Worktree"}
      >
        <span>{currentWorktree ? `wt/${currentWorktree}` : "base"}</span>
        <ChevronDown size={12} />
      </button>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Worktrees" description={workspace} size="sm">
        <div className="p-5 space-y-5">
          <div className="flex items-center justify-between">
            <div className="text-xs text-black/50 dark:text-white/50">Select or create a worktree.</div>
            <button
              type="button"
              onClick={() => void loadWorktrees()}
              className="inline-flex items-center gap-1 text-xs text-black/60 dark:text-white/60 hover:text-black/80 dark:hover:text-white/80"
            >
              <RefreshCcw size={12} />
              Refresh
            </button>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => handleSelect(null)}
              className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                !currentWorktree
                  ? "border-black/20 dark:border-white/20 bg-black/[0.04] dark:bg-white/[0.04]"
                  : "border-black/[0.08] dark:border-white/[0.08] hover:border-black/20 dark:hover:border-white/20"
              }`}
            >
              <div className="font-medium text-black/90 dark:text-white/90">Base workspace</div>
              <div className="text-xs text-black/50 dark:text-white/50">No worktree selected</div>
            </button>

            {loading && <div className="text-xs text-black/40 dark:text-white/40 px-3 py-2">Loading worktrees…</div>}
            {error && <div className="text-xs text-red-500 px-3 py-2">{error}</div>}
            {removeError && <div className="text-xs text-red-500 px-3 py-2">{removeError}</div>}

            {!loading &&
              worktrees.map(item => {
                const isActive = item.slug === currentWorktree
                const isRemoving = removingSlug === item.slug
                return (
                  <div key={item.slug} className="flex items-stretch gap-2">
                    <button
                      type="button"
                      onClick={() => handleSelect(item.slug)}
                      className={`flex-1 text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                        isActive
                          ? "border-black/20 dark:border-white/20 bg-black/[0.04] dark:bg-white/[0.04]"
                          : "border-black/[0.08] dark:border-white/[0.08] hover:border-black/20 dark:hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-black/90 dark:text-white/90">{item.slug}</div>
                        {item.branch && (
                          <span className="text-[10px] text-black/50 dark:text-white/50">{item.branch}</span>
                        )}
                      </div>
                      <div className="text-[11px] text-black/40 dark:text-white/40">{item.pathRelative}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRemove(item.slug)}
                      disabled={isRemoving}
                      className="px-2 rounded-lg border border-black/[0.08] dark:border-white/[0.08] text-[11px] text-red-500/80 hover:text-red-500 hover:border-red-400/50 transition-colors disabled:opacity-50"
                    >
                      {isRemoving ? "Removing…" : "Remove"}
                    </button>
                  </div>
                )
              })}
          </div>

          <div className="border-t border-black/[0.08] dark:border-white/[0.08] pt-4 space-y-3">
            <div className="text-xs font-medium text-black/70 dark:text-white/70">Create worktree</div>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="slug (optional, e.g. feature-branch)"
                value={slug}
                onChange={e => setSlug(e.target.value)}
                aria-label="Worktree slug"
                className="w-full rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-transparent px-3 py-2 text-sm"
              />
              <input
                type="text"
                placeholder="branch (optional)"
                value={branch}
                onChange={e => setBranch(e.target.value)}
                aria-label="Branch name (optional)"
                className="w-full rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-transparent px-3 py-2 text-sm"
              />
              <input
                type="text"
                placeholder="from (optional, e.g. main)"
                value={from}
                onChange={e => setFrom(e.target.value)}
                aria-label="Base ref (optional)"
                className="w-full rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-transparent px-3 py-2 text-sm"
              />
              {createError && <div className="text-xs text-red-500">{createError}</div>}
              <button
                type="button"
                disabled={creating}
                onClick={() => void handleCreate()}
                className="w-full rounded-lg bg-black text-white dark:bg-white dark:text-black text-sm py-2 font-medium disabled:opacity-60"
              >
                {creating ? "Creating…" : "Create worktree"}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  )
}
