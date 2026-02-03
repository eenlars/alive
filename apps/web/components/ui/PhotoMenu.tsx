"use client"

import { Check, Copy, Plus, Trash2, X } from "lucide-react"
import type { RefObject } from "react"
import { useEffect, useRef, useState } from "react"
import { DeleteModal } from "@/components/modals/DeleteModal"
import { useWorkspace } from "@/features/workspace/hooks/useWorkspace"
import { useImageActions, useImages, useImagesLoading, useImagesUploading } from "@/lib/stores/imageStore"

interface PhotoMenuProps {
  isOpen: boolean
  onClose: () => void
  onSelectImage?: (imageKey: string) => void
  triggerRef?: RefObject<HTMLButtonElement | null>
}

export function PhotoMenu({ isOpen, onClose, onSelectImage, triggerRef }: PhotoMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const mobileSheetRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { workspace, isTerminal, mounted } = useWorkspace({ allowEmpty: true })
  const images = useImages()
  const loading = useImagesLoading()
  const uploading = useImagesUploading()
  const { uploadImages, loadImages, deleteImage } = useImageActions()
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [isFilePickerOpen, setIsFilePickerOpen] = useState(false)

  // Click outside to close (desktop dropdown only - mobile uses backdrop)
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      // Don't close if file picker is open (prevents closing on mobile when native picker opens)
      if (isFilePickerOpen) return
      if (!(event.target instanceof Node)) return

      // Check all possible containers
      const clickedDesktopMenu = menuRef.current?.contains(event.target)
      const clickedMobileSheet = mobileSheetRef.current?.contains(event.target)
      const clickedTrigger = triggerRef?.current?.contains(event.target)
      const clickedFileInput = fileInputRef.current?.contains(event.target)

      if (!clickedDesktopMenu && !clickedMobileSheet && !clickedTrigger && !clickedFileInput) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isOpen, onClose, triggerRef, isFilePickerOpen])

  // Prevent body scroll on mobile when open
  useEffect(() => {
    if (isOpen) {
      const isMobile = window.innerWidth < 640
      if (isMobile) {
        document.body.style.overflow = "hidden"
      }
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen && mounted && (!isTerminal || workspace)) {
      const workspaceParam = isTerminal && workspace ? workspace : undefined
      loadImages(workspaceParam)
    }
  }, [isOpen, mounted, isTerminal, workspace, loadImages])

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setIsFilePickerOpen(false) // File picker closed (user selected or cancelled)
    const files = event.target.files
    if (!files || files.length === 0) return

    const workspaceParam = isTerminal && workspace ? workspace : undefined

    await uploadImages(files, workspaceParam)

    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleUploadClick = () => {
    setIsFilePickerOpen(true) // Prevent closing while native file picker is open
    fileInputRef.current?.click()
  }

  const handleDeleteConfirm = () => {
    if (deleteConfirm) {
      const workspaceParam = isTerminal && workspace ? workspace : undefined
      deleteImage(deleteConfirm, workspaceParam)
      setDeleteConfirm(null)
    }
  }

  const handleCopyUrl = async (imageKey: string) => {
    const image = images.find(img => img.key === imageKey)
    if (!image) return

    const fullUrl = `${window.location.origin}${image.variants.orig}`

    try {
      await navigator.clipboard.writeText(fullUrl)
      setCopiedKey(imageKey)
      setTimeout(() => setCopiedKey(null), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  if (!isOpen) return null

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      multiple
      onChange={handleFileSelect}
      className="hidden"
      aria-label="Upload images"
    />
  )

  const uploadButton = (
    <button
      type="button"
      onClick={handleUploadClick}
      disabled={uploading}
      className="w-full py-3 rounded-xl bg-black/[0.04] dark:bg-white/[0.06]
        hover:bg-black/[0.08] dark:hover:bg-white/[0.10]
        active:bg-black/[0.12] dark:active:bg-white/[0.14]
        transition-colors duration-150
        disabled:opacity-30 disabled:cursor-not-allowed
        flex items-center justify-center gap-2"
      aria-label={uploading ? "Uploading images" : "Upload new images"}
    >
      <Plus className="w-4 h-4 text-black/50 dark:text-white/50" />
      <span className="text-sm font-[500] text-black/70 dark:text-white/70">Add photos</span>
    </button>
  )

  const handleImageClick = (imageKey: string) => {
    if (onSelectImage) {
      onSelectImage(imageKey)
      onClose()
    }
  }

  const imageGrid = (
    <>
      {images.map(image => (
        <div key={image.key} className="relative group">
          <button
            type="button"
            className="w-full border-0 p-0 bg-transparent cursor-pointer"
            onClick={() => handleImageClick(image.key)}
            draggable
            onDragStart={e => {
              e.dataTransfer.effectAllowed = "copy"
              e.dataTransfer.setData("application/x-photobook-image", image.key)
            }}
          >
            <img
              src={image.variants.thumb}
              alt=""
              className="w-full h-auto rounded-lg hover:opacity-90 active:opacity-70 transition-opacity pointer-events-none"
            />
          </button>
          {/* Action buttons: always visible on mobile, hover on desktop */}
          <div className="absolute top-1 right-1 flex flex-col gap-1">
            <button
              type="button"
              onClick={e => {
                e.stopPropagation()
                setDeleteConfirm(image.key)
              }}
              className="p-1.5 rounded-md bg-black/60 dark:bg-white/80 text-white dark:text-black
                hover:bg-black/80 dark:hover:bg-white
                opacity-100 sm:opacity-0 sm:group-hover:opacity-100
                transition-all duration-150 shadow-sm"
              aria-label="Delete image"
            >
              <Trash2 className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation()
                handleCopyUrl(image.key)
              }}
              className={`p-1.5 rounded-md shadow-sm
                opacity-100 sm:opacity-0 sm:group-hover:opacity-100
                transition-all duration-150 ${
                  copiedKey === image.key
                    ? "bg-green-500 text-white"
                    : "bg-black/60 dark:bg-white/80 text-white dark:text-black hover:bg-black/80 dark:hover:bg-white"
                }`}
              aria-label="Copy image URL"
            >
              {copiedKey === image.key ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
        </div>
      ))}
    </>
  )

  const loadingState = (
    <div className="flex items-center justify-center py-8">
      <p className="text-sm font-[300] text-black/40 dark:text-white/40">Loading...</p>
    </div>
  )

  const deleteModal = deleteConfirm && (
    <DeleteModal
      title="Delete this image?"
      message="This action cannot be undone."
      confirmText="Delete"
      cancelText="Cancel"
      onConfirm={handleDeleteConfirm}
      onCancel={() => setDeleteConfirm(null)}
    />
  )

  return (
    <>
      {/* Shared file input - only one instance */}
      {fileInput}

      {/* Mobile: Bottom sheet */}
      <div className="sm:hidden fixed inset-0 z-50">
        {/* Backdrop */}
        <button
          type="button"
          className="absolute inset-0 bg-black/40"
          onClick={() => !isFilePickerOpen && onClose()}
          tabIndex={-1}
          aria-label="Close"
        />

        {/* Bottom sheet */}
        <div
          ref={mobileSheetRef}
          className="absolute bottom-0 left-0 right-0 h-[85vh] bg-white dark:bg-neutral-900 rounded-t-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-black/[0.08] dark:border-white/[0.08]">
            <h2 className="text-base font-[500] text-black dark:text-white">Photos</h2>
            <button
              type="button"
              onClick={() => !isFilePickerOpen && onClose()}
              className="p-2 -mr-2 rounded-full hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-black/60 dark:text-white/60" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? loadingState : <div className="grid grid-cols-3 gap-2">{imageGrid}</div>}
          </div>

          {/* Sticky upload button */}
          <div className="p-4 border-t border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-neutral-900">
            {uploadButton}
            {uploading && <p className="text-xs text-black/40 dark:text-white/40 mt-2 text-center">Uploading...</p>}
          </div>
        </div>

        {deleteModal}
      </div>

      {/* Desktop: Dropdown */}
      <div
        ref={menuRef}
        className="hidden sm:block absolute top-full right-0 mt-2 w-[380px]
          bg-white dark:bg-neutral-900 rounded-2xl shadow-xl
          ring-1 ring-black/[0.06] dark:ring-white/[0.06]
          z-50 overflow-hidden
          animate-in fade-in slide-in-from-bottom-2 duration-150"
      >
        <div className="max-h-[360px] overflow-y-auto p-3">
          {loading ? loadingState : <div className="grid grid-cols-4 gap-2">{imageGrid}</div>}
        </div>

        {/* Sticky upload button */}
        <div className="p-3 border-t border-black/[0.06] dark:border-white/[0.06]">
          {uploadButton}
          {uploading && <p className="text-xs text-black/40 dark:text-white/40 mt-2 text-center">Uploading...</p>}
        </div>

        {deleteModal}
      </div>
    </>
  )
}
