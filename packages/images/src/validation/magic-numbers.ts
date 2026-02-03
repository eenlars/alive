/**
 * MIME type signatures (magic numbers)
 * These are the first bytes of valid image files
 *
 * SECURITY: Never trust file extensions or Content-Type headers.
 * Always validate using magic numbers to prevent .php.jpg attacks.
 */
const SIGNATURES: Record<string, number[]> = {
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47],
  "image/webp": [0x52, 0x49, 0x46, 0x46],
  "image/gif": [0x47, 0x49, 0x46, 0x38],
}

/**
 * Validate image type by reading file signature (magic numbers)
 * @param buffer - File buffer
 * @returns Detected MIME type or null if invalid
 */
export function validateImageType(buffer: Buffer): string | null {
  for (const [mimeType, signature] of Object.entries(SIGNATURES)) {
    if (signature.every((byte, i) => buffer[i] === byte)) {
      return mimeType
    }
  }
  return null
}

/**
 * Get allowed MIME types
 */
export function getAllowedMimeTypes(): string[] {
  return Object.keys(SIGNATURES)
}
