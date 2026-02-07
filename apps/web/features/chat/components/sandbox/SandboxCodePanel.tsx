"use client"

import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { CodeViewer } from "./CodeViewer"
import { FileTree } from "./FileTree"

interface SandboxCodePanelProps {
  workspace: string
  worktree?: string | null
  filePath: string | null
  expandedFolders: Set<string>
  treeWidth: number
  treeCollapsed: boolean
  onSelectFile: (path: string) => void
  onCloseFile: () => void
  onToggleFolder: (path: string) => void
  onSetTreeWidth: (width: number) => void
  onToggleTreeCollapsed: () => void
}

const MIN_TREE_WIDTH = 120
const MAX_TREE_WIDTH = 400

export function SandboxCodePanel({
  workspace,
  worktree,
  filePath,
  expandedFolders,
  treeWidth,
  treeCollapsed,
  onSelectFile,
  onCloseFile,
  onToggleFolder,
  onSetTreeWidth,
  onToggleTreeCollapsed,
}: SandboxCodePanelProps) {
  const [isResizing, setIsResizing] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Handle resize drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      const containerRect = containerRef.current.getBoundingClientRect()
      const newWidth = e.clientX - containerRect.left
      const clampedWidth = Math.max(MIN_TREE_WIDTH, Math.min(MAX_TREE_WIDTH, newWidth))
      onSetTreeWidth(clampedWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isResizing, onSetTreeWidth])

  // Keyboard: Escape closes file
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && filePath) {
        e.preventDefault()
        onCloseFile()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [filePath, onCloseFile])

  return (
    <div ref={containerRef} className={`h-full flex bg-white dark:bg-[#0d0d0d] ${isResizing ? "select-none" : ""}`}>
      {/* File tree sidebar */}
      {!treeCollapsed && (
        <div
          className="flex flex-col shrink-0 border-r border-black/[0.08] dark:border-white/[0.04]"
          style={{ width: treeWidth }}
        >
          {/* Tree header */}
          <div className="h-9 px-2 flex items-center justify-between border-b border-black/[0.08] dark:border-white/[0.04] bg-neutral-100/50 dark:bg-neutral-900/30 shrink-0">
            <span className="text-[11px] font-medium text-neutral-500 uppercase tracking-wider">Files</span>
            <button
              type="button"
              onClick={onToggleTreeCollapsed}
              className="p-1 text-neutral-400 dark:text-neutral-600 hover:text-neutral-600 dark:hover:text-neutral-400 rounded transition-colors"
              title="Collapse sidebar"
            >
              <PanelLeftClose size={14} strokeWidth={1.5} />
            </button>
          </div>

          {/* Tree content */}
          <div className="flex-1 overflow-hidden">
            <FileTree
              workspace={workspace}
              worktree={worktree}
              activeFile={filePath}
              expandedFolders={expandedFolders}
              onToggleFolder={onToggleFolder}
              onSelectFile={onSelectFile}
            />
          </div>
        </div>
      )}

      {/* Resize handle */}
      {!treeCollapsed && (
        // biome-ignore lint/a11y/noStaticElementInteractions: resize handle requires mouse interaction
        <div
          className="w-1 shrink-0 cursor-col-resize hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-colors relative group"
          onMouseDown={handleMouseDown}
        >
          {isResizing && <div className="absolute inset-y-0 -left-1 -right-1 bg-sky-500/20" />}
        </div>
      )}

      {/* Code viewer */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Collapsed tree toggle */}
        {treeCollapsed && (
          <div className="h-9 px-2 flex items-center border-b border-black/[0.08] dark:border-white/[0.04] bg-neutral-100/50 dark:bg-neutral-900/30 shrink-0">
            <button
              type="button"
              onClick={onToggleTreeCollapsed}
              className="p-1 text-neutral-400 dark:text-neutral-600 hover:text-neutral-600 dark:hover:text-neutral-400 rounded transition-colors"
              title="Show sidebar"
            >
              <PanelLeftOpen size={14} strokeWidth={1.5} />
            </button>
          </div>
        )}

        {/* Code content */}
        {filePath ? (
          <CodeViewer workspace={workspace} worktree={worktree} filePath={filePath} onClose={onCloseFile} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-neutral-400 dark:text-neutral-600 text-sm">
            <span>Select a file to view</span>
          </div>
        )}
      </div>
    </div>
  )
}
