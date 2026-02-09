"use client"

import { PanelLeftClose, PanelLeftOpen, RefreshCw } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { FilespacePreview } from "./FilespacePreview"
import { FilespaceTree, invalidateFilespaceCache } from "./FilespaceTree"
import { FilespaceUpload } from "./FilespaceUpload"
import { deleteFilespaceItem } from "./filespace-api"

interface FilespacePanelProps {
  workspace: string
  worktree?: string | null
}

const MIN_TREE_WIDTH = 160
const MAX_TREE_WIDTH = 500
const DEFAULT_TREE_WIDTH = 240

export function FilespacePanel({ workspace, worktree }: FilespacePanelProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [treeWidth, setTreeWidth] = useState(DEFAULT_TREE_WIDTH)
  const [treeCollapsed, setTreeCollapsed] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleToggleFolder = useCallback((path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  const handleSelectFile = useCallback((path: string) => {
    setSelectedFile(path)
  }, [])

  const handleCloseFile = useCallback(() => {
    setSelectedFile(null)
  }, [])

  const handleDeleteFile = useCallback(
    async (path: string, isDir: boolean) => {
      const label = isDir ? "directory" : "file"
      if (!confirm(`Delete ${label} "${path}"?`)) return

      try {
        await deleteFilespaceItem(workspace, path, { worktree, recursive: isDir })
        if (selectedFile === path) setSelectedFile(null)
        invalidateFilespaceCache(workspace, worktree)
        setRefreshKey(k => k + 1)
      } catch (err) {
        alert(err instanceof Error ? err.message : "Delete failed")
      }
    },
    [workspace, worktree, selectedFile],
  )

  const handleRefresh = useCallback(() => {
    invalidateFilespaceCache(workspace, worktree)
    setRefreshKey(k => k + 1)
  }, [workspace, worktree])

  const handleUploadComplete = useCallback(() => {
    invalidateFilespaceCache(workspace, worktree)
    setRefreshKey(k => k + 1)
  }, [workspace, worktree])

  // Resize drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const newWidth = e.clientX - rect.left
      setTreeWidth(Math.max(MIN_TREE_WIDTH, Math.min(MAX_TREE_WIDTH, newWidth)))
    }

    const handleMouseUp = () => setIsResizing(false)

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)
    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isResizing])

  // Escape to close file
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedFile) {
        e.preventDefault()
        setSelectedFile(null)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectedFile])

  return (
    <div ref={containerRef} className={`h-full flex bg-white dark:bg-[#0d0d0d] ${isResizing ? "select-none" : ""}`}>
      {/* File tree sidebar */}
      {!treeCollapsed && (
        <div
          className="flex flex-col shrink-0 border-r border-black/[0.08] dark:border-white/[0.04]"
          style={{ width: treeWidth }}
        >
          {/* Header */}
          <div className="h-9 px-2 flex items-center justify-between border-b border-black/[0.08] dark:border-white/[0.04] bg-neutral-100/50 dark:bg-neutral-900/30 shrink-0">
            <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Files</span>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={handleRefresh}
                className="p-1 text-neutral-400 dark:text-neutral-600 hover:text-neutral-600 dark:hover:text-neutral-400 rounded transition-colors"
                title="Refresh"
              >
                <RefreshCw size={12} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                onClick={() => setTreeCollapsed(true)}
                className="p-1 text-neutral-400 dark:text-neutral-600 hover:text-neutral-600 dark:hover:text-neutral-400 rounded transition-colors"
                title="Collapse sidebar"
              >
                <PanelLeftClose size={14} strokeWidth={1.5} />
              </button>
            </div>
          </div>

          {/* Tree */}
          <div className="flex-1 overflow-hidden">
            <FilespaceTree
              workspace={workspace}
              worktree={worktree}
              activeFile={selectedFile}
              expandedFolders={expandedFolders}
              onToggleFolder={handleToggleFolder}
              onSelectFile={handleSelectFile}
              onDeleteFile={handleDeleteFile}
              refreshKey={refreshKey}
            />
          </div>

          {/* Upload */}
          <FilespaceUpload workspace={workspace} worktree={worktree} onUploadComplete={handleUploadComplete} />
        </div>
      )}

      {/* Resize handle */}
      {!treeCollapsed && (
        // biome-ignore lint/a11y/noStaticElementInteractions: resize handle
        <div
          className="w-1 shrink-0 cursor-col-resize hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-colors relative group"
          onMouseDown={handleMouseDown}
        >
          {isResizing && <div className="absolute inset-y-0 -left-1 -right-1 bg-sky-500/20" />}
        </div>
      )}

      {/* Preview area */}
      <div className="flex-1 flex flex-col min-w-0">
        {treeCollapsed && (
          <div className="h-9 px-2 flex items-center border-b border-black/[0.08] dark:border-white/[0.04] bg-neutral-100/50 dark:bg-neutral-900/30 shrink-0">
            <button
              type="button"
              onClick={() => setTreeCollapsed(false)}
              className="p-1 text-neutral-400 dark:text-neutral-600 hover:text-neutral-600 dark:hover:text-neutral-400 rounded transition-colors"
              title="Show sidebar"
            >
              <PanelLeftOpen size={14} strokeWidth={1.5} />
            </button>
          </div>
        )}

        {selectedFile ? (
          <FilespacePreview
            workspace={workspace}
            worktree={worktree}
            filePath={selectedFile}
            onClose={handleCloseFile}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-neutral-400 dark:text-neutral-600 text-sm">
            <span>Select a file to preview</span>
          </div>
        )}
      </div>
    </div>
  )
}
