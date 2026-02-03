import type { ImageStorage } from "../storage/interface.js"
import type { UploadOptions, UploadResult, Variant } from "../types/config.js"
import type { HResponse } from "../types/response.js"
import { Rs } from "../types/response.js"
import { validateImageType } from "../validation/magic-numbers.js"
import { validateFileSize } from "../validation/size-limits.js"
import { compressImage, generateVariant } from "./compress.js"
import { generateContentHash } from "./hash.js"

/**
 * Upload image with compression and variant generation
 *
 * @param storage - Storage backend
 * @param tenantId - Tenant identifier
 * @param file - Image buffer
 * @param options - Upload options
 * @returns Upload result with keys and URLs
 */
export async function uploadImage(
  storage: ImageStorage,
  tenantId: string,
  file: Buffer,
  options: UploadOptions = {},
): HResponse<UploadResult> {
  try {
    // 1. Validate file size
    const sizeError = validateFileSize(file.length)
    if (sizeError) {
      return Rs.error(sizeError, "validation:size")
    }

    // 2. Validate file type (magic numbers)
    const detectedType = validateImageType(file)
    if (!detectedType) {
      return Rs.error("Invalid file type. Only images allowed.", "validation:type")
    }

    // 3. Generate content hash
    const contentHash = generateContentHash(file)

    // 4. Compress original
    const compressed = await compressImage(file, {
      maxWidth: options.maxWidth || 1920,
      targetSize: options.targetSize || 150 * 1024,
    })

    // 5. Generate variants
    const variants: Variant[] = options.variants || ["orig"]
    const keys: Record<string, string> = {}
    const urls: Record<string, string> = {}

    // Store original
    if (variants.includes("orig")) {
      const result = await storage.put(tenantId, contentHash, "orig", compressed.buffer)

      if (result.error) {
        return Rs.error(result.error.message, result.error.code)
      }

      keys.orig = result.data
      urls.orig = `/_images/${result.data}`
    }

    // Generate and store additional variants
    const variantSizes: Record<string, number> = {
      w640: 640,
      w1280: 1280,
      thumb: 300,
    }

    for (const variant of variants) {
      if (variant === "orig") continue

      const width = variantSizes[variant]
      if (!width) continue

      // Generate variant
      const variantImage = await generateVariant(compressed.buffer, width)

      // Store variant
      const result = await storage.put(tenantId, contentHash, variant, variantImage.buffer)

      if (result.error) {
        // Log error but don't fail entire upload
        console.error(`Failed to generate variant ${variant}:`, result.error)
        continue
      }

      keys[variant] = result.data
      urls[variant] = `/_images/${result.data}`
    }

    return Rs.data({
      contentHash,
      keys: keys as Record<Variant, string>,
      urls: urls as Record<Variant, string>,
      width: compressed.width,
      height: compressed.height,
      fileSize: compressed.size,
    })
  } catch (error) {
    return Rs.fromError(error, "upload:error")
  }
}
