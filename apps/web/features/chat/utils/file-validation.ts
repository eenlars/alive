import type { FileCategory } from "../components/ChatInput/types/file-types"
import { getFileCategory, isImageMimeType } from "../components/ChatInput/types/file-types"

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]
const ALLOWED_DOCUMENT_TYPES = ["application/pdf", "text/plain", "text/markdown"]

const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export function validateFile(
  file: File,
  options: {
    maxFileSize?: number
    allowedFileTypes?: string[]
  } = {},
): { valid: boolean; error?: string } {
  const maxSize = options.maxFileSize || DEFAULT_MAX_FILE_SIZE
  const allowedTypes = options.allowedFileTypes || [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOCUMENT_TYPES]

  // Check file size
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File size exceeds ${Math.round(maxSize / 1024 / 1024)}MB limit`,
    }
  }

  // Check file type
  if (!allowedTypes.includes(file.type)) {
    const fileExtension = file.name.split(".").pop()?.toUpperCase() || "Unknown"
    return {
      valid: false,
      error: `${fileExtension} files are not supported. Please upload images (JPG, PNG, GIF, WebP) or documents (PDF, TXT).`,
    }
  }

  return { valid: true }
}

export function getAttachmentType(file: File): FileCategory {
  return getFileCategory(file.type)
}

export function createPreviewUrl(file: File): string | undefined {
  if (isImageMimeType(file.type)) {
    return URL.createObjectURL(file)
  }
  return undefined
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}
