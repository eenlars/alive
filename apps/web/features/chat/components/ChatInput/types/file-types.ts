export type FileCategory = "image" | "document" | "unknown"

export function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith("image/")
}

export function getFileCategory(mimeType: string): FileCategory {
  if (mimeType.startsWith("image/")) return "image"
  if (mimeType.startsWith("application/") || mimeType.startsWith("text/")) return "document"
  return "unknown"
}
