/**
 * Default size limits
 */
export const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
export const MIN_FILE_SIZE = 100 // 100 bytes

/**
 * Validate file size
 * @param size - File size in bytes
 * @param maxSize - Maximum allowed size (optional)
 * @returns Error message or null if valid
 */
export function validateFileSize(size: number, maxSize: number = MAX_FILE_SIZE): string | null {
  if (size < MIN_FILE_SIZE) {
    return `File too small. Minimum size: ${MIN_FILE_SIZE} bytes`
  }

  if (size > maxSize) {
    const maxMB = (maxSize / (1024 * 1024)).toFixed(1)
    return `File too large. Maximum size: ${maxMB}MB`
  }

  return null
}
