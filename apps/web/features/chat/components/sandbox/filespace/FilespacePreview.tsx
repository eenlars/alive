"use client"

import { File, Image, X } from "lucide-react"
import { useFileContent } from "../hooks/useFileContent"
import { getFileColor } from "../lib/file-colors"
import { getExtension, getFileName } from "../lib/file-path"
import { ErrorMessage, LoadingSpinner } from "../ui"

interface FilespacePreviewProps {
  workspace: string
  worktree?: string | null
  filePath: string
  onClose: () => void
}

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp"])

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / 1024 ** i).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

export function FilespacePreview({ workspace, worktree, filePath, onClose }: FilespacePreviewProps) {
  const ext = getExtension(filePath)
  const isImage = IMAGE_EXTENSIONS.has(ext)
  const filename = getFileName(filePath)

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="h-9 px-3 flex items-center gap-2 border-b border-black/[0.08] dark:border-white/[0.04] bg-neutral-100/50 dark:bg-neutral-900/30 shrink-0">
        <File size={14} strokeWidth={1.5} className={getFileColor(filename)} />
        <span className="text-[13px] text-neutral-700 dark:text-neutral-300 truncate flex-1">{filename}</span>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-neutral-400 dark:text-neutral-600 hover:text-neutral-700 dark:hover:text-neutral-300 rounded transition-colors"
          title="Close"
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isImage ? (
          <ImagePreviewPlaceholder filename={filename} />
        ) : (
          <TextPreview workspace={workspace} worktree={worktree} filePath={filePath} />
        )}
      </div>
    </div>
  )
}

function ImagePreviewPlaceholder({ filename }: { filename: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-neutral-400 dark:text-neutral-600">
      <Image size={48} strokeWidth={1} className="opacity-50" />
      <p className="text-sm">{filename}</p>
      <p className="text-xs">Image preview</p>
    </div>
  )
}

function TextPreview({
  workspace,
  worktree,
  filePath,
}: {
  workspace: string
  worktree?: string | null
  filePath: string
}) {
  const { file, loading, error } = useFileContent(workspace, filePath, worktree)

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorMessage message={error} />

  return (
    <div className="p-4">
      {file && (
        <div className="mb-3 flex items-center gap-3 text-[11px] text-neutral-400 dark:text-neutral-600">
          <span>{formatSize(file.size)}</span>
          <span>{file.language}</span>
        </div>
      )}
      <pre className="font-mono text-[13px] leading-relaxed text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap break-words">
        {file?.content}
      </pre>
    </div>
  )
}
