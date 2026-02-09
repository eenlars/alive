"use client"

import { Upload } from "lucide-react"
import { useCallback, useRef, useState } from "react"
import { uploadFilespaceItem } from "./filespace-api"

interface FilespaceUploadProps {
  workspace: string
  worktree?: string | null
  onUploadComplete: () => void
}

export function FilespaceUpload({ workspace, worktree, onUploadComplete }: FilespaceUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCountRef = useRef(0)

  const handleUpload = useCallback(
    async (files: FileList | File[]) => {
      setError(null)
      setUploading(true)

      try {
        for (const file of files) {
          await uploadFilespaceItem(workspace, file, worktree)
        }
        onUploadComplete()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed")
      } finally {
        setUploading(false)
      }
    },
    [workspace, worktree, onUploadComplete],
  )

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCountRef.current++
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCountRef.current--
    if (dragCountRef.current === 0) {
      setIsDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCountRef.current = 0
      setIsDragging(false)

      if (e.dataTransfer.files.length > 0) {
        handleUpload(e.dataTransfer.files)
      }
    },
    [handleUpload],
  )

  const handleClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleUpload(e.target.files)
        e.target.value = ""
      }
    },
    [handleUpload],
  )

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop zone requires drag event handlers
    <div
      className={`border-t border-black/[0.08] dark:border-white/[0.04] p-3 ${isDragging ? "bg-sky-50 dark:bg-sky-900/20" : ""}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <button
        type="button"
        onClick={handleClick}
        disabled={uploading}
        className={`w-full py-3 px-4 border border-dashed rounded-lg flex flex-col items-center gap-1.5 transition-colors ${
          isDragging
            ? "border-sky-400 bg-sky-50/50 dark:bg-sky-900/10"
            : "border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700"
        } ${uploading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <Upload size={16} strokeWidth={1.5} className="text-neutral-400 dark:text-neutral-600" />
        <span className="text-[12px] text-neutral-400 dark:text-neutral-600">
          {uploading ? "Uploading..." : isDragging ? "Drop to upload" : "Drop files or click to upload"}
        </span>
      </button>

      {error && <p className="mt-2 text-[11px] text-red-500">{error}</p>}

      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileChange} />
    </div>
  )
}
