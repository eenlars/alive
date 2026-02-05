"use client"

import { create } from "zustand"
import { UploadError, uploadImage } from "@/features/chat/utils/upload-handler"

const IMAGE_PATH_PREFIX = "/_images/"

export interface UploadedImage {
  key: string
  variants: {
    orig: string
    w640: string
    w1280: string
    thumb: string
  }
  uploadedAt: string
}

function transformImageVariants(image: UploadedImage): UploadedImage {
  return {
    ...image,
    variants: {
      orig: `${IMAGE_PATH_PREFIX}${image.variants.orig}`,
      w640: `${IMAGE_PATH_PREFIX}${image.variants.w640}`,
      w1280: `${IMAGE_PATH_PREFIX}${image.variants.w1280}`,
      thumb: `${IMAGE_PATH_PREFIX}${image.variants.thumb}`,
    },
  }
}

function sortImagesByDate(images: UploadedImage[]): UploadedImage[] {
  // Sort newest first
  return images.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
}

// State interface
interface ImageState {
  images: UploadedImage[]
  loading: boolean
  uploading: boolean
  error: string | null
}

// Actions interface - grouped under stable object (Guide §14.3)
interface ImageActions {
  actions: {
    loadImages: (workspace?: string, worktree?: string | null) => Promise<void>
    uploadImages: (
      files: FileList,
      workspace?: string,
      worktree?: string | null,
    ) => Promise<{ success: boolean; error?: string }>
    deleteImage: (key: string, workspace?: string, worktree?: string | null) => Promise<void>
  }
}

type ImageStore = ImageState & ImageActions

const useImageStoreBase = create<ImageStore>((set, get) => {
  const loadImages = async (workspace?: string, worktree?: string | null) => {
    const currentState = get()
    if (currentState.loading) return

    set({ loading: true, error: null })

    try {
      const url = new URL("/api/images/list", window.location.origin)
      if (workspace) {
        url.searchParams.set("workspace", workspace)
      }
      if (worktree) {
        url.searchParams.set("worktree", worktree)
      }

      const response = await fetch(url.toString(), { credentials: "include" })
      if (!response.ok) {
        throw new Error("Failed to load images")
      }

      const data = await response.json()
      const transformedImages = (data.images || []).map(transformImageVariants)
      const sortedImages = sortImagesByDate(transformedImages)

      set({
        images: sortedImages,
        loading: false,
        error: null,
      })
    } catch (err) {
      console.error("Failed to load images:", err)
      set({
        images: [],
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load images",
      })
    }
  }

  const uploadImages = async (files: FileList, workspace?: string, worktree?: string | null) => {
    if (files.length === 0) {
      return { success: false, error: "No files selected" }
    }

    set({ uploading: true, error: null })

    try {
      // Upload files in parallel using shared upload handler
      const uploadPromises = Array.from(files).map(async file => {
        return await uploadImage(file, {
          workspace,
          worktree,
          isTerminal: !!workspace, // If workspace is explicitly provided, treat as terminal mode
        })
      })

      await Promise.all(uploadPromises)

      // Reload images after successful upload
      await loadImages(workspace, worktree)

      set({ uploading: false })
      return { success: true }
    } catch (err) {
      console.error("Upload failed:", err)
      // Use categorized error message if available
      const errorMessage =
        err instanceof UploadError ? err.message : err instanceof Error ? err.message : "Failed to upload images"
      set({ uploading: false, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  const deleteImage = async (key: string, workspace?: string, worktree?: string | null) => {
    const imageToDelete = get().images.find(img => img.key === key)

    // Optimistically remove from UI
    set(state => ({
      images: sortImagesByDate(state.images.filter(img => img.key !== key)),
    }))

    try {
      const body: { key: string; workspace?: string; worktree?: string } = { key }
      if (workspace) {
        body.workspace = workspace
      }
      if (worktree) {
        body.worktree = worktree
      }

      const response = await fetch("/api/images/delete", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        // Restore on failure
        if (imageToDelete) {
          set(state => ({
            images: sortImagesByDate([...state.images, imageToDelete]),
            error: "Failed to delete image. Please try again.",
          }))
        }
      }
    } catch (_err) {
      // Restore on error
      if (imageToDelete) {
        set(state => ({
          images: sortImagesByDate([...state.images, imageToDelete]),
          error: "Failed to delete image. Please try again.",
        }))
      }
    }
  }

  const actions = { loadImages, uploadImages, deleteImage }
  return {
    images: [],
    loading: false,
    uploading: false,
    error: null,
    actions,
  }
})

// Atomic selector: images list (Guide §14.1)
export const useImages = () => useImageStoreBase(state => state.images)

// Atomic selector: loading state (Guide §14.1)
export const useImagesLoading = () => useImageStoreBase(state => state.loading)

// Atomic selector: uploading state (Guide §14.1)
export const useImagesUploading = () => useImageStoreBase(state => state.uploading)

// Atomic selector: error state (Guide §14.1)
export const useImagesError = () => useImageStoreBase(state => state.error)

// Actions hook - stable reference (Guide §14.3)
export const useImageActions = () => useImageStoreBase(state => state.actions)
