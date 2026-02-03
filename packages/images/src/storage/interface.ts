import type { HResponse } from "../types/response.js"

/**
 * Storage adapter interface
 * Implementation can be filesystem, S3, Supabase, etc.
 */
export interface ImageStorage {
  /**
   * Store image data
   * @param tenantId - Stable tenant identifier
   * @param contentHash - SHA-256 hash of original content
   * @param variant - Image variant (orig, w640, thumb, etc.)
   * @param data - Image buffer
   * @returns Storage key
   */
  put(tenantId: string, contentHash: string, variant: string, data: Buffer): HResponse<string>

  /**
   * Retrieve image data
   * @param key - Storage key
   * @returns Image buffer or null if not found
   */
  get(key: string): HResponse<Buffer | null>

  /**
   * Delete image
   * @param key - Storage key
   */
  delete(key: string): HResponse<void>

  /**
   * List images for tenant
   * @param tenantId - Tenant identifier
   * @param prefix - Optional prefix filter
   * @returns Array of storage keys
   */
  list(tenantId: string, prefix?: string): HResponse<string[]>

  /**
   * Generate signed URL for private access
   * @param key - Storage key
   * @param expiresIn - Expiration time in seconds
   * @returns Signed URL
   */
  getSignedUrl(key: string, expiresIn: number): HResponse<string>
}
