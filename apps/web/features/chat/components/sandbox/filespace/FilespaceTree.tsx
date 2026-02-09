"use client"

import { ChevronRight, File, Folder, Trash2 } from "lucide-react"
import { memo, useCallback, useEffect, useState } from "react"
import { getFileColor } from "../lib/file-colors"
import type { FilespaceFile } from "./filespace-api"
import { listFilespace } from "./filespace-api"

interface FilespaceTreeProps {
  workspace: string
  worktree?: string | null
  activeFile: string | null
  expandedFolders: Set<string>
  onToggleFolder: (path: string) => void
  onSelectFile: (path: string) => void
  onDeleteFile: (path: string, isDir: boolean) => void
  refreshKey: number
}

const fileCache = new Map<string, FilespaceFile[]>()

function getCacheKey(workspace: string, worktree: string | null | undefined, path: string): string {
  const scope = worktree ? `wt/${worktree}` : "base"
  return `fs::${workspace}::${scope}::${path}`
}

export function FilespaceTree({
  workspace,
  worktree,
  activeFile,
  expandedFolders,
  onToggleFolder,
  onSelectFile,
  onDeleteFile,
  refreshKey,
}: FilespaceTreeProps) {
  return (
    <div className="h-full overflow-y-auto text-[13px] py-1">
      <TreeLevel
        workspace={workspace}
        worktree={worktree}
        path=""
        depth={0}
        activeFile={activeFile}
        expandedFolders={expandedFolders}
        onToggleFolder={onToggleFolder}
        onSelectFile={onSelectFile}
        onDeleteFile={onDeleteFile}
        refreshKey={refreshKey}
      />
    </div>
  )
}

interface TreeLevelProps {
  workspace: string
  worktree?: string | null
  path: string
  depth: number
  activeFile: string | null
  expandedFolders: Set<string>
  onToggleFolder: (path: string) => void
  onSelectFile: (path: string) => void
  onDeleteFile: (path: string, isDir: boolean) => void
  refreshKey: number
}

function TreeLevel({
  workspace,
  worktree,
  path,
  depth,
  activeFile,
  expandedFolders,
  onToggleFolder,
  onSelectFile,
  onDeleteFile,
  refreshKey,
}: TreeLevelProps) {
  const cacheKey = getCacheKey(workspace, worktree, path)
  const [files, setFiles] = useState<FilespaceFile[]>(() => fileCache.get(cacheKey) || [])
  const [loading, setLoading] = useState(!fileCache.has(cacheKey))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function load() {
      setLoading(true)
      try {
        const result = await listFilespace(workspace, path, worktree)
        if (!mounted) return

        const sorted = [...result.files].sort((a, b) => {
          if (a.type !== b.type) return a.type === "directory" ? -1 : 1
          return a.name.localeCompare(b.name)
        })
        fileCache.set(cacheKey, sorted)
        setFiles(sorted)
        setError(null)
      } catch (err) {
        if (!mounted) return
        setError(err instanceof Error ? err.message : "Failed to load files")
      }
      setLoading(false)
    }

    load()
    return () => {
      mounted = false
    }
  }, [workspace, worktree, path, cacheKey, refreshKey])

  if (loading && depth === 0) {
    return <div className="px-3 py-2 text-neutral-400 dark:text-neutral-600">Loading...</div>
  }

  if (error && depth === 0) {
    return <div className="px-3 py-2 text-neutral-400 dark:text-neutral-500">{error}</div>
  }

  if (files.length === 0 && depth === 0 && !loading) {
    return <div className="px-3 py-2 text-neutral-400 dark:text-neutral-600">Empty</div>
  }

  return (
    <>
      {files.map(item => (
        <TreeNode
          key={item.path}
          workspace={workspace}
          worktree={worktree}
          item={item}
          depth={depth}
          isActive={activeFile === item.path}
          isExpanded={item.type === "directory" && expandedFolders.has(item.path)}
          activeFile={activeFile}
          expandedFolders={expandedFolders}
          onToggleFolder={onToggleFolder}
          onSelectFile={onSelectFile}
          onDeleteFile={onDeleteFile}
          refreshKey={refreshKey}
        />
      ))}
    </>
  )
}

interface TreeNodeProps {
  workspace: string
  worktree?: string | null
  item: FilespaceFile
  depth: number
  isActive: boolean
  isExpanded: boolean
  activeFile: string | null
  expandedFolders: Set<string>
  onToggleFolder: (path: string) => void
  onSelectFile: (path: string) => void
  onDeleteFile: (path: string, isDir: boolean) => void
  refreshKey: number
}

const TreeNode = memo(function TreeNode({
  workspace,
  worktree,
  item,
  depth,
  isActive,
  isExpanded,
  activeFile,
  expandedFolders,
  onToggleFolder,
  onSelectFile,
  onDeleteFile,
  refreshKey,
}: TreeNodeProps) {
  const isFolder = item.type === "directory"
  const [hovered, setHovered] = useState(false)

  const handleClick = useCallback(() => {
    if (isFolder) {
      onToggleFolder(item.path)
    } else {
      onSelectFile(item.path)
    }
  }, [isFolder, item.path, onToggleFolder, onSelectFile])

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onDeleteFile(item.path, isFolder)
    },
    [item.path, isFolder, onDeleteFile],
  )

  const paddingLeft = 8 + depth * 12

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`w-full h-7 flex items-center gap-1 text-left transition-colors ${
          isActive
            ? "bg-black/[0.06] dark:bg-white/[0.08] text-black dark:text-white"
            : "text-neutral-600 dark:text-neutral-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] hover:text-neutral-800 dark:hover:text-neutral-300"
        }`}
        style={{ paddingLeft }}
      >
        {isFolder ? (
          <ChevronRight
            size={14}
            strokeWidth={1.5}
            className={`shrink-0 text-neutral-400 dark:text-neutral-600 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
          />
        ) : (
          <span className="w-[14px] shrink-0" />
        )}

        {isFolder ? (
          <Folder size={14} strokeWidth={1.5} className="shrink-0 text-amber-500/80" />
        ) : (
          <File size={14} strokeWidth={1.5} className={`shrink-0 ${getFileColor(item.name)}`} />
        )}

        <span className="truncate flex-1 pr-1">{item.name}</span>

        {hovered && (
          // biome-ignore lint/a11y/useSemanticElements: nested inside button, can't use button element
          <span
            role="button"
            tabIndex={-1}
            onClick={handleDelete}
            onKeyDown={e => {
              if (e.key === "Enter") handleDelete(e as unknown as React.MouseEvent)
            }}
            className="shrink-0 p-0.5 mr-1 text-neutral-400 dark:text-neutral-600 hover:text-red-500 dark:hover:text-red-400 rounded transition-colors"
            title="Delete"
          >
            <Trash2 size={12} strokeWidth={1.5} />
          </span>
        )}
      </button>

      {isFolder && isExpanded && (
        <TreeLevel
          workspace={workspace}
          worktree={worktree}
          path={item.path}
          depth={depth + 1}
          activeFile={activeFile}
          expandedFolders={expandedFolders}
          onToggleFolder={onToggleFolder}
          onSelectFile={onSelectFile}
          onDeleteFile={onDeleteFile}
          refreshKey={refreshKey}
        />
      )}
    </>
  )
})

export function invalidateFilespaceCache(workspace?: string, worktree?: string | null): void {
  if (workspace) {
    const scope = worktree ? `wt/${worktree}` : "base"
    for (const key of fileCache.keys()) {
      if (key.startsWith(`fs::${workspace}::${scope}::`)) {
        fileCache.delete(key)
      }
    }
    return
  }
  fileCache.clear()
}
