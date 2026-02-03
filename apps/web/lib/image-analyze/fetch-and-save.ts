import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Result of fetching and saving an image for analysis
 */
export interface SavedAnalyzeImage {
  /** Original URL the image was fetched from */
  originalUrl: string
  /** Path relative to workspace where image was saved */
  workspacePath: string
  /** MIME type of the image */
  mimeType: string
  /** Size in bytes */
  size: number
}

/**
 * Fetches images from URLs and saves them to the workspace for Claude to analyze.
 * Images are saved to .uploads/ directory which Claude's Read tool can access.
 *
 * @param imageUrls - Array of image URLs to fetch (relative paths like /_images/...)
 * @param workspacePath - Absolute path to workspace directory
 * @param baseUrl - Base URL for resolving relative paths (e.g., "https://example.com")
 * @returns Array of saved image info with workspace paths
 */
export async function fetchAndSaveAnalyzeImages(
  imageUrls: string[],
  workspacePath: string,
  baseUrl: string,
): Promise<SavedAnalyzeImage[]> {
  if (!imageUrls.length) return []

  // Ensure .uploads directory exists
  const uploadsDir = join(workspacePath, ".uploads")
  if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir, { recursive: true })
  }

  const results: SavedAnalyzeImage[] = []

  for (const url of imageUrls) {
    try {
      // Resolve relative URLs to absolute
      const absoluteUrl = url.startsWith("/") ? `${baseUrl}${url}` : url

      // Fetch the image
      const response = await fetch(absoluteUrl)
      if (!response.ok) {
        console.warn(`Failed to fetch image ${url}: ${response.status} ${response.statusText}`)
        continue
      }

      const contentType = response.headers.get("content-type") || "image/webp"
      const buffer = Buffer.from(await response.arrayBuffer())

      // Generate unique filename with proper extension
      const ext = getExtensionFromMimeType(contentType)
      const filename = `analyze-${randomUUID().slice(0, 8)}${ext}`
      const filePath = join(uploadsDir, filename)

      // Save to workspace
      writeFileSync(filePath, buffer)

      results.push({
        originalUrl: url,
        workspacePath: `.uploads/${filename}`,
        mimeType: contentType,
        size: buffer.length,
      })
    } catch (error) {
      console.error(`Error fetching/saving image ${url}:`, error)
      // Continue with other images
    }
  }

  return results
}

/**
 * Get file extension from MIME type
 */
function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    "image/webp": ".webp",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
    "image/avif": ".avif",
  }
  return mimeToExt[mimeType] || ".webp"
}

/**
 * Build prompt instructions for analyze images
 */
export function buildAnalyzeImagePrompt(originalMessage: string, savedImages: SavedAnalyzeImage[]): string {
  if (!savedImages.length) return originalMessage

  const imagesList = savedImages
    .map(img => `  - ${img.workspacePath} (${img.mimeType}, ${formatFileSize(img.size)})`)
    .join("\n")

  return `<images_to_analyze>
The user wants you to analyze ${savedImages.length} image${savedImages.length > 1 ? "s" : ""}:

${imagesList}

Use the Read tool to visually examine ${savedImages.length > 1 ? "these images" : "this image"}:
  Read({ file_path: "${savedImages[0].workspacePath}" })

The Read tool will show you the image content so you can describe, analyze, or answer questions about it.
</images_to_analyze>

${originalMessage}`
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`
}
