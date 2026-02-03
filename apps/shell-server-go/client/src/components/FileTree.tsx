import { useCallback, useEffect, useState } from "react"
import { deleteItem, listFiles } from "../api/files"
import { useFilesStore } from "../store/files"
import { useUIStore } from "../store/ui"
import { useUploadStore } from "../store/upload"
import type { TreeNode } from "../types/domain"
import { transformApiTree } from "../types/domain"

// ============================================================================
// Custom Hook - Reduces store coupling
// ============================================================================

function useFileTree() {
  const workspace = useUploadStore(s => s.workspace)
  const setMessage = useUIStore(s => s.setMessage)

  const fileTreePath = useFilesStore(s => s.fileTreePath)
  const fileTree = useFilesStore(s => s.fileTree)
  const fileTreeLoading = useFilesStore(s => s.fileTreeLoading)
  const selectedItem = useFilesStore(s => s.selectedItem)

  const setFileTreePath = useFilesStore(s => s.setFileTreePath)
  const setFileTree = useFilesStore(s => s.setFileTree)
  const setFileTreeLoading = useFilesStore(s => s.setFileTreeLoading)
  const selectItem = useFilesStore(s => s.selectItem)
  const clearSelectedItem = useFilesStore(s => s.clearSelectedItem)

  const loadTree = useCallback(async () => {
    setFileTreeLoading(true)
    clearSelectedItem()
    try {
      const result = await listFiles(workspace)
      if (result.error) {
        setFileTreePath(`Error: ${result.error}`)
        setFileTree([])
      } else {
        setFileTreePath(result.path)
        setFileTree(transformApiTree(result.tree))
      }
    } catch (err) {
      setFileTreePath(`Error: ${(err as Error).message}`)
      setFileTree([])
    } finally {
      setFileTreeLoading(false)
    }
  }, [workspace, setFileTreeLoading, clearSelectedItem, setFileTreePath, setFileTree])

  return {
    workspace,
    fileTreePath,
    fileTree,
    fileTreeLoading,
    selectedItem,
    loadTree,
    selectItem,
    clearSelectedItem,
    setMessage,
  }
}

// ============================================================================
// TreeItem Component - With accessibility
// ============================================================================

interface TreeItemProps {
  node: TreeNode
  depth: number
  selectedPath: string | null
  onSelect: (node: TreeNode) => void
}

function TreeItem({ node, depth, selectedPath, onSelect }: TreeItemProps) {
  const [expanded, setExpanded] = useState(false)
  const isSelected = selectedPath === node.path
  const isDirectory = node.type === "directory"
  const hasChildren = node.children && node.children.length > 0

  function handleActivate() {
    onSelect(node)
    if (isDirectory) {
      setExpanded(prev => !prev)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      handleActivate()
    }
    if (e.key === "ArrowRight" && isDirectory && !expanded) {
      e.preventDefault()
      setExpanded(true)
    }
    if (e.key === "ArrowLeft" && isDirectory && expanded) {
      e.preventDefault()
      setExpanded(false)
    }
  }

  return (
    <div role="treeitem" aria-expanded={isDirectory ? expanded : undefined} aria-selected={isSelected}>
      <div
        role="button"
        tabIndex={0}
        onClick={handleActivate}
        onKeyDown={handleKeyDown}
        className={`py-1 px-2 cursor-pointer hover:bg-[#3a3a3a] rounded text-sm flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-shell-accent ${isSelected ? "bg-shell-accent text-white" : "text-shell-text"}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {isDirectory && hasChildren && (
          <span className="text-xs w-3" aria-hidden="true">
            {expanded ? "▼" : "▶"}
          </span>
        )}
        {isDirectory && !hasChildren && <span className="w-3" aria-hidden="true" />}
        <span className="text-xs" aria-hidden="true">
          {isDirectory ? "📁" : "📄"}
        </span>
        <span className="truncate">{node.text}</span>
      </div>
      {expanded && hasChildren && (
        <div role="group">
          {node.children!.map(child => (
            <TreeItem key={child.path} node={child} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// FileTree Component
// ============================================================================

interface FileTreeProps {
  onFileSelect: (path: string) => void
}

export function FileTree({ onFileSelect }: FileTreeProps) {
  const {
    workspace,
    fileTreePath,
    fileTree,
    fileTreeLoading,
    selectedItem,
    loadTree,
    selectItem,
    clearSelectedItem,
    setMessage,
  } = useFileTree()

  useEffect(() => {
    loadTree()
  }, [workspace, loadTree])

  function handleSelect(node: TreeNode) {
    selectItem(node.path, node.type)
    if (node.type === "file") {
      onFileSelect(node.path)
    }
  }

  async function handleDelete() {
    if (!selectedItem) return
    const typeLabel = selectedItem.type === "directory" ? "folder" : "file"
    const extraWarning = selectedItem.type === "directory" ? " and all its contents" : ""
    if (
      !confirm(
        `Are you sure you want to delete "${selectedItem.path}"${extraWarning}?\n\nThis action cannot be undone.`,
      )
    )
      return

    try {
      const result = await deleteItem(workspace, selectedItem.path)
      if (result.success) {
        setMessage(result.message, "success")
        clearSelectedItem()
        loadTree()
      } else {
        setMessage(result.error || `Failed to delete ${typeLabel}`, "error")
      }
    } catch (err) {
      setMessage(`Delete failed: ${(err as Error).message}`, "error")
    }
  }

  return (
    <div className="bg-shell-surface rounded-lg flex flex-col h-full min-h-[400px]">
      <div className="p-3 border-b border-shell-border shrink-0">
        <div className="flex justify-between items-center mb-2">
          <span className="text-shell-accent text-sm font-mono truncate flex-1">
            {fileTreePath || "No files loaded"}
          </span>
          <button
            type="button"
            onClick={loadTree}
            disabled={fileTreeLoading}
            className="bg-shell-blue hover:bg-shell-blue-hover text-white border-none rounded px-2.5 py-1 text-xs cursor-pointer transition-colors ml-2"
          >
            {fileTreeLoading ? "Loading..." : "Refresh"}
          </button>
        </div>
        {selectedItem && (
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-shell-border">
            <span className="text-yellow-400 text-xs truncate flex-1 font-mono">{selectedItem.path}</span>
            <button
              type="button"
              onClick={handleDelete}
              className="bg-shell-danger hover:bg-shell-danger-hover text-white border-none rounded px-3 py-1.5 text-xs cursor-pointer transition-colors whitespace-nowrap"
            >
              {selectedItem.type === "directory" ? "Delete Folder" : "Delete File"}
            </button>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-auto bg-shell-bg rounded-b-lg p-2" role="tree" aria-label="File tree">
        {fileTree.length === 0 ? (
          <div className="flex items-center justify-center h-full text-shell-text-muted text-sm">
            {fileTreeLoading ? "Loading..." : "No files"}
          </div>
        ) : (
          fileTree.map(node => (
            <TreeItem
              key={node.path}
              node={node}
              depth={0}
              selectedPath={selectedItem?.path ?? null}
              onSelect={handleSelect}
            />
          ))
        )}
      </div>
    </div>
  )
}
