import { useCallback, useState } from "react"
import { UploadError, uploadImage } from "@/features/chat/utils/upload-handler"
import type { UploadedImage } from "@/lib/stores/imageStore"

const API_ENDPOINTS = {
  LIST: "/api/images/list",
  DELETE: "/api/images/delete",
} as const

export type { UploadedImage }

interface DeleteImageBody {
  key: string
  workspace?: string
}

function sortImagesByDate(images: UploadedImage[]): UploadedImage[] {
  return images.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
}

function buildDeleteBody(key: string, isTerminal: boolean, workspace: string): DeleteImageBody {
  const body: DeleteImageBody = { key }
  if (isTerminal && workspace) {
    body.workspace = workspace
  }
  return body
}

export function useImageManagement(isTerminal: boolean, workspace: string) {
  const [images, setImages] = useState<UploadedImage[]>([])
  const [loadingImages, setLoadingImages] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const clearMessages = useCallback(() => {
    setError("")
    setSuccess("")
  }, [])

  const loadImages = useCallback(async () => {
    try {
      setLoadingImages(true)
      const url = new URL(API_ENDPOINTS.LIST, window.location.origin)

      if (isTerminal && workspace) {
        url.searchParams.set("workspace", workspace)
      }

      const response = await fetch(url.toString())
      if (response.ok) {
        const data = await response.json()
        setImages(data.images || [])
      }
    } catch (err) {
      console.error("Could not load images:", err)
    } finally {
      setLoadingImages(false)
    }
  }, [isTerminal, workspace])

  const uploadImages = useCallback(
    async (files: FileList) => {
      setUploading(true)
      clearMessages()

      try {
        // Use shared upload handler with retry and error categorization
        const uploadPromises = Array.from(files).map(async file => {
          return await uploadImage(file, {
            workspace,
            isTerminal,
          })
        })

        const results = await Promise.all(uploadPromises)
        setSuccess(`Uploaded ${results.length} image${results.length > 1 ? "s" : ""}`)
        await loadImages()
      } catch (err) {
        // Use categorized error message if available
        const errorMessage =
          err instanceof UploadError ? err.message : err instanceof Error ? err.message : "Upload failed"
        setError(errorMessage)
      } finally {
        setUploading(false)
      }
    },
    [isTerminal, workspace, loadImages, clearMessages],
  )

  const deleteImage = useCallback(
    async (key: string) => {
      const imageToDelete = images.find(img => img.key === key)

      // Optimistically remove
      setImages(prev => prev.filter(img => img.key !== key))
      clearMessages()

      try {
        const body = buildDeleteBody(key, isTerminal, workspace)

        const response = await fetch(API_ENDPOINTS.DELETE, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })

        if (!response.ok) {
          // Restore on failure
          if (imageToDelete) {
            setImages(prev => sortImagesByDate([...prev, imageToDelete]))
          }
          setError("Failed to delete image. Please try again.")
        }
      } catch (_err) {
        // Restore on error
        if (imageToDelete) {
          setImages(prev => sortImagesByDate([...prev, imageToDelete]))
        }
        setError("Failed to delete image. Please try again.")
      }
    },
    [images, isTerminal, workspace, clearMessages],
  )

  return {
    images,
    loadingImages,
    uploading,
    error,
    success,
    loadImages,
    uploadImages,
    deleteImage,
    clearMessages,
  }
}
