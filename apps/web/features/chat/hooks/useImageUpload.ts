/**
 * Hook for handling image uploads with progress tracking and image store sync
 */

import { useCallback } from "react"
import { uploadImage } from "@/features/chat/utils/upload-handler"
import { useImageActions } from "@/lib/stores/imageStore"

interface UseImageUploadOptions {
  workspace?: string
  worktree?: string | null
  isTerminal?: boolean
}

export function useImageUpload(options: UseImageUploadOptions) {
  const { workspace, worktree, isTerminal } = options
  const { loadImages } = useImageActions()

  const uploadWithSync = useCallback(
    async (file: File, onProgress?: (progress: number) => void): Promise<string> => {
      // Upload with progress tracking and retry logic
      const imageKey = await uploadImage(file, {
        workspace,
        worktree,
        isTerminal,
        onProgress: onProgress ? progress => onProgress(progress.percentage) : undefined,
      })

      // Sync image store after successful upload (background, don't block)
      loadImages(workspace, worktree).catch(err => {
        console.warn("[useImageUpload] Failed to sync image store:", err)
      })

      return imageKey
    },
    [workspace, worktree, isTerminal, loadImages],
  )

  return uploadWithSync
}
