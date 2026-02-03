import { useState } from "react"
import type { EditTreeNode } from "../../api/edit"
import { deleteEditItem } from "../../api/edit"
import { useEditorStore } from "../../store/editor"

function getFileIcon(name: string, isFolder: boolean, isOpen: boolean): string {
  if (isFolder) return isOpen ? "📂" : "📁"

  const ext = name.split(".").pop()?.toLowerCase()
  switch (ext) {
    case "ts":
    case "tsx":
      return "🔷"
    case "js":
    case "jsx":
      return "🟨"
    case "json":
      return "📋"
    case "md":
      return "📝"
    case "css":
    case "scss":
      return "🎨"
    case "html":
      return "🌐"
    case "svg":
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
      return "🖼️"
    case "sh":
    case "bash":
      return "⚙️"
    default:
      return "📄"
  }
}

function TreeItem({
  node,
  depth,
  onFileSelect,
  onDelete,
}: {
  node: EditTreeNode
  depth: number
  onFileSelect: (path: string) => void
  onDelete: (path: string, type: "file" | "directory") => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [hovering, setHovering] = useState(false)
  const activeTabPath = useEditorStore(s => s.activeTabPath)
  const isActiveFile = activeTabPath === node.path
  const isDirectory = node.type === "directory"
  const hasChildren = node.children && node.children.length > 0
  const icon = getFileIcon(node.name, isDirectory, expanded)

  function handleClick() {
    if (isDirectory) {
      setExpanded(!expanded)
    } else {
      onFileSelect(node.path)
    }
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    onDelete(node.path, node.type)
  }

  return (
    <div>
      <div
        onClick={handleClick}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        className={`group py-1 px-2 cursor-pointer hover:bg-[#3a3a3a] rounded text-sm flex items-center gap-1.5 select-none ${
          isActiveFile ? "bg-shell-accent text-white" : "text-shell-text"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <span className="text-xs w-4 text-center shrink-0">
          {isDirectory && hasChildren ? (expanded ? "▼" : "▶") : ""}
        </span>
        <span className="text-sm shrink-0">{icon}</span>
        <span className="truncate flex-1">{node.name}</span>
        {hovering && (
          <button
            type="button"
            onClick={handleDelete}
            className="text-shell-text-muted hover:text-red-400 text-xs px-1 shrink-0"
            title={`Delete ${isDirectory ? "folder" : "file"}`}
          >
            ✕
          </button>
        )}
      </div>
      {expanded &&
        hasChildren &&
        node.children!.map(child => (
          <TreeItem key={child.path} node={child} depth={depth + 1} onFileSelect={onFileSelect} onDelete={onDelete} />
        ))}
    </div>
  )
}

interface EditorFileTreeProps {
  onFileSelect: (path: string) => void
  onRefresh: () => void
}

export function EditorFileTree({ onFileSelect, onRefresh }: EditorFileTreeProps) {
  const editorTree = useEditorStore(s => s.editorTree)
  const editorTreeLoading = useEditorStore(s => s.editorTreeLoading)
  const editorTreeError = useEditorStore(s => s.editorTreeError)
  const currentDirectory = useEditorStore(s => s.currentDirectory)
  const closeTab = useEditorStore(s => s.closeTab)
  const openTabs = useEditorStore(s => s.openTabs)

  async function handleDelete(path: string, type: "file" | "directory") {
    const typeLabel = type === "directory" ? "folder" : "file"
    const extraWarning = type === "directory" ? " and all its contents" : ""

    if (!confirm(`Delete "${path}"${extraWarning}?\n\nThis cannot be undone.`)) {
      return
    }

    try {
      const result = await deleteEditItem(currentDirectory, path)
      if (result.success) {
        // Close any open tabs for deleted files
        if (type === "directory") {
          // Close all tabs within the deleted directory
          for (const tab of openTabs) {
            if (tab.path === path || tab.path.startsWith(`${path}/`)) {
              closeTab(tab.path)
            }
          }
        } else {
          closeTab(path)
        }
        onRefresh()
      } else {
        alert(result.error || `Failed to delete ${typeLabel}`)
      }
    } catch (err) {
      alert(`Delete failed: ${(err as Error).message}`)
    }
  }

  if (editorTreeLoading) {
    return <div className="text-shell-text-muted text-sm text-center py-4">Loading...</div>
  }

  if (editorTreeError) {
    return <div className="text-shell-danger text-sm text-center py-4">{editorTreeError}</div>
  }

  if (editorTree.length === 0) {
    return <div className="text-shell-text-muted text-sm text-center py-4">No files</div>
  }

  return (
    <div className="h-full overflow-auto bg-shell-bg p-2">
      {editorTree.map(node => (
        <TreeItem key={node.path} node={node} depth={0} onFileSelect={onFileSelect} onDelete={handleDelete} />
      ))}
    </div>
  )
}
