"use client"

import { ArrowLeft, Upload } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { DeleteModal } from "@/components/modals/DeleteModal"
import { useWorkspace } from "@/features/workspace/hooks/useWorkspace"
// Feature hooks
import { useCopyToClipboard, useImageManagement } from "../hooks"
// Feature components
import { ImageCard } from "./ImageCard"
import { LoadingState } from "./LoadingState"
import { ImageZoomModal, MessageBanner } from "./modals"

export default function PhotobookPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Workspace management
  const { workspace, isTerminal, mounted } = useWorkspace({ allowEmpty: true })

  // Image management
  const { images, loadingImages, uploading, error, success, loadImages, uploadImages, deleteImage, clearMessages } =
    useImageManagement(isTerminal, workspace || "")

  // Copy to clipboard
  const { copyToClipboard, isCopied } = useCopyToClipboard()

  // Local UI state
  const [dragActive, setDragActive] = useState(false)
  const [zoomedImage, setZoomedImage] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Load images when workspace is ready
  useEffect(() => {
    if (mounted && (!isTerminal || workspace)) {
      loadImages()
    }
  }, [mounted, isTerminal, workspace, loadImages])

  // Handlers
  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (files && files.length > 0) {
      clearMessages()
      await uploadImages(files)
      // Reset file input so same files can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  function handleDrag(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      clearMessages()
      await uploadImages(files)
    }
  }

  function handleDeleteConfirm() {
    if (deleteConfirm) {
      deleteImage(deleteConfirm)
      setDeleteConfirm(null)
    }
  }

  return (
    <main
      className={`min-h-screen bg-white dark:bg-zinc-950 text-black dark:text-white transition-all ${dragActive ? "bg-blue-50 dark:bg-blue-950/30" : ""}`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      <div className="max-w-5xl mx-auto p-8">
        {/* Header - polished with consistent opacity scale */}
        <header className="mb-12">
          <div className="flex items-center gap-3 mb-2">
            <button
              type="button"
              onClick={() => router.push("/chat")}
              className="size-9 rounded-full flex items-center justify-center text-black/40 dark:text-white/40 hover:text-black/70 dark:hover:text-white/70 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] active:bg-black/[0.07] dark:active:bg-white/[0.09] transition-all duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 dark:focus-visible:ring-white/20"
              aria-label="Back to chat"
            >
              <ArrowLeft className="size-5" strokeWidth={2} />
            </button>
            <h1 className="text-2xl font-semibold text-black/80 dark:text-white/80">Photos</h1>
          </div>
          <p className="text-base text-black/40 dark:text-white/40 ml-12">Copy photo links and paste them in chat</p>
        </header>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
          aria-label="Select images to upload"
        />

        {/* Drag overlay - polished with ring, shadow-xl, and smooth animation */}
        {dragActive && (
          <div className="fixed inset-0 bg-black/[0.04] dark:bg-white/[0.04] backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in duration-150">
            <div className="bg-white dark:bg-neutral-900 rounded-3xl shadow-xl ring-1 ring-black/[0.08] dark:ring-white/[0.08] p-10 animate-in zoom-in-95 duration-150">
              <div className="flex flex-col items-center">
                <div className="size-16 rounded-full bg-black dark:bg-white flex items-center justify-center mb-4">
                  <Upload className="size-8 text-white dark:text-black" />
                </div>
                <p className="text-xl font-semibold text-black/80 dark:text-white/80">Drop to upload</p>
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        {error && <MessageBanner message={error} type="error" />}
        {success && <MessageBanner message={success} type="success" />}

        {/* Image gallery or empty states */}
        {images.length === 0 && !uploading && !loadingImages ? (
          <div className="text-center py-24">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex flex-col items-center cursor-pointer group focus:outline-none"
            >
              {/* Icon container - using opacity-based fills instead of color swaps */}
              <div className="inline-flex items-center justify-center size-24 rounded-full bg-black/[0.04] dark:bg-white/[0.06] mb-6 group-hover:bg-black/[0.07] dark:group-hover:bg-white/[0.09] transition-all duration-150">
                <Upload className="size-12 text-black/40 dark:text-white/40 group-hover:text-black/70 dark:group-hover:text-white/70 transition-colors duration-150" />
              </div>
              <h2 className="text-3xl font-semibold text-black/80 dark:text-white/80 mb-3">Drop photos here</h2>
              <p className="text-lg text-black/40 dark:text-white/40 mb-2">Drag files from your computer</p>
              <p className="text-base text-black/70 dark:text-white/70 font-medium">or click to browse</p>
            </button>
          </div>
        ) : images.length === 0 && loadingImages ? (
          <LoadingState message="Loading your images..." />
        ) : images.length > 0 || uploading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Add photos block - polished with ring and opacity-based fills */}
            <div className="group">
              <div className="bg-white dark:bg-neutral-900 rounded-3xl overflow-hidden shadow-lg ring-1 ring-black/[0.06] dark:ring-white/[0.06] hover:ring-black/[0.10] dark:hover:ring-white/[0.10] transition-all duration-150 ease-in-out">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full aspect-square border-2 border-dashed border-black/[0.08] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/[0.04] dark:hover:bg-white/[0.04] hover:border-black/[0.14] dark:hover:border-white/[0.14] transition-all duration-150 cursor-pointer flex flex-col items-center justify-center gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 dark:focus-visible:ring-white/20 rounded-3xl"
                >
                  <div className="size-14 rounded-full bg-black/[0.04] dark:bg-white/[0.06] group-hover:bg-black/[0.07] dark:group-hover:bg-white/[0.09] flex items-center justify-center transition-all duration-150">
                    <Upload className="size-7 text-black/40 dark:text-white/40 group-hover:text-black/70 dark:group-hover:text-white/70 transition-colors duration-150" />
                  </div>
                  <span className="text-sm font-medium text-black/40 dark:text-white/40 group-hover:text-black/70 dark:group-hover:text-white/70 transition-colors duration-150">
                    Add Photos
                  </span>
                </button>
              </div>
            </div>

            {/* Uploading placeholder - polished with consistent styling */}
            {uploading && (
              <div className="group animate-in fade-in duration-300">
                <div className="bg-white dark:bg-neutral-900 rounded-3xl overflow-hidden shadow-lg ring-1 ring-black/[0.06] dark:ring-white/[0.06]">
                  <div className="w-full aspect-square bg-black/[0.02] dark:bg-white/[0.02] flex items-center justify-center">
                    <div className="text-center">
                      <div className="size-10 border-2 border-black/[0.08] dark:border-white/[0.08] border-t-black/40 dark:border-t-white/40 rounded-full animate-spin mx-auto mb-3" />
                      <p className="text-sm text-black/40 dark:text-white/40">Uploading...</p>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="w-full py-2.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] animate-pulse" />
                  </div>
                </div>
              </div>
            )}

            {images.map(image => (
              <ImageCard
                key={image.key}
                image={image}
                onDelete={setDeleteConfirm}
                onZoom={setZoomedImage}
                onCopy={copyToClipboard}
                isCopied={isCopied(image.key)}
              />
            ))}
          </div>
        ) : null}

        {/* Modals */}
        {zoomedImage && <ImageZoomModal imageSrc={zoomedImage} onClose={() => setZoomedImage(null)} />}

        {deleteConfirm && (
          <DeleteModal
            title="Delete this image?"
            message="This action cannot be undone."
            confirmText="Yes, delete"
            cancelText="No, keep it"
            onConfirm={handleDeleteConfirm}
            onCancel={() => setDeleteConfirm(null)}
          />
        )}
      </div>
    </main>
  )
}
