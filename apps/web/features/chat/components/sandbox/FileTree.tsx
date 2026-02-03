"use client"

import { ChevronRight, File, Folder } from "lucide-react"
import { memo, useCallback, useEffect, useState } from "react"
import { type FileInfo, listFiles } from "./lib/file-api"
import { getFileColor } from "./lib/file-colors"

interface FileTreeProps {
  workspace: string
  activeFile: string | null
  expandedFolders: Set<string>
  onToggleFolder: (path: string) => void
  onSelectFile: (path: string) => void
}

// Global cache for file listings - persists across re-renders
const fileCache = new Map<string, FileInfo[]>()

function getCacheKey(workspace: string, path: string): string {
  return `${workspace}::${path}`
}

export function FileTree({ workspace, activeFile, expandedFolders, onToggleFolder, onSelectFile }: FileTreeProps) {
  return (
    <div className="h-full overflow-y-auto text-[13px] py-1">
      <TreeLevel
        workspace={workspace}
        path=""
        depth={0}
        activeFile={activeFile}
        expandedFolders={expandedFolders}
        onToggleFolder={onToggleFolder}
        onSelectFile={onSelectFile}
      />
    </div>
  )
}

interface TreeLevelProps {
  workspace: string
  path: string
  depth: number
  activeFile: string | null
  expandedFolders: Set<string>
  onToggleFolder: (path: string) => void
  onSelectFile: (path: string) => void
}

function TreeLevel({
  workspace,
  path,
  depth,
  activeFile,
  expandedFolders,
  onToggleFolder,
  onSelectFile,
}: TreeLevelProps) {
  const cacheKey = getCacheKey(workspace, path)
  const [files, setFiles] = useState<FileInfo[]>(() => fileCache.get(cacheKey) || [])
  const [loading, setLoading] = useState(!fileCache.has(cacheKey))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Already cached - no need to fetch
    if (fileCache.has(cacheKey)) {
      setFiles(fileCache.get(cacheKey)!)
      setLoading(false)
      return
    }

    let mounted = true

    async function load() {
      setLoading(true)
      const result = await listFiles(workspace, path)
      if (!mounted) return

      if (result.ok) {
        // Sort: folders first, then files, alphabetically
        const sorted = [...result.data].sort((a, b) => {
          if (a.type !== b.type) return a.type === "directory" ? -1 : 1
          return a.name.localeCompare(b.name)
        })
        fileCache.set(cacheKey, sorted)
        setFiles(sorted)
        setError(null)
      } else {
        setError(result.error)
      }
      setLoading(false)
    }

    load()
    return () => {
      mounted = false
    }
  }, [workspace, path, cacheKey])

  if (loading && depth === 0) {
    return <div className="px-3 py-2 text-neutral-600">Loading...</div>
  }

  if (error && depth === 0) {
    return <div className="px-3 py-2 text-neutral-500">{error}</div>
  }

  if (files.length === 0 && depth === 0 && !loading) {
    return <div className="px-3 py-2 text-neutral-600">Empty</div>
  }

  return (
    <>
      {files.map(item => (
        <TreeNode
          key={item.path}
          workspace={workspace}
          item={item}
          depth={depth}
          isActive={activeFile === item.path}
          isExpanded={item.type === "directory" && expandedFolders.has(item.path)}
          activeFile={activeFile}
          expandedFolders={expandedFolders}
          onToggleFolder={onToggleFolder}
          onSelectFile={onSelectFile}
        />
      ))}
    </>
  )
}

interface TreeNodeProps {
  workspace: string
  item: FileInfo
  depth: number
  isActive: boolean
  isExpanded: boolean
  activeFile: string | null
  expandedFolders: Set<string>
  onToggleFolder: (path: string) => void
  onSelectFile: (path: string) => void
}

// Memoize TreeNode to prevent re-renders when other nodes change
const TreeNode = memo(function TreeNode({
  workspace,
  item,
  depth,
  isActive,
  isExpanded,
  activeFile,
  expandedFolders,
  onToggleFolder,
  onSelectFile,
}: TreeNodeProps) {
  const isFolder = item.type === "directory"

  const handleClick = useCallback(() => {
    if (isFolder) {
      onToggleFolder(item.path)
    } else {
      onSelectFile(item.path)
    }
  }, [isFolder, item.path, onToggleFolder, onSelectFile])

  const paddingLeft = 8 + depth * 12

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`w-full h-7 flex items-center gap-1 text-left transition-colors ${
          isActive ? "bg-white/[0.08] text-white" : "text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-300"
        }`}
        style={{ paddingLeft }}
      >
        {/* Chevron for folders */}
        {isFolder ? (
          <ChevronRight
            size={14}
            strokeWidth={1.5}
            className={`shrink-0 text-neutral-600 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
          />
        ) : (
          <span className="w-[14px] shrink-0" />
        )}

        {/* Icon */}
        {isFolder ? (
          <Folder size={14} strokeWidth={1.5} className="shrink-0 text-amber-500/80" />
        ) : (
          <File size={14} strokeWidth={1.5} className={`shrink-0 ${getFileColor(item.name)}`} />
        )}

        {/* Name */}
        <span className="truncate pr-2">{item.name}</span>
      </button>

      {/* Children (if expanded folder) */}
      {isFolder && isExpanded && (
        <TreeLevel
          workspace={workspace}
          path={item.path}
          depth={depth + 1}
          activeFile={activeFile}
          expandedFolders={expandedFolders}
          onToggleFolder={onToggleFolder}
          onSelectFile={onSelectFile}
        />
      )}
    </>
  )
})

// Export cache invalidation for manual refresh
export function invalidateFileCache(workspace?: string, path?: string): void {
  if (workspace && path !== undefined) {
    fileCache.delete(getCacheKey(workspace, path))
  } else if (workspace) {
    // Clear all entries for workspace
    for (const key of fileCache.keys()) {
      if (key.startsWith(`${workspace}::`)) {
        fileCache.delete(key)
      }
    }
  } else {
    fileCache.clear()
  }
}
