import type {
  Attachment,
  LibraryImageAttachment,
  SkillAttachment,
  UploadedFileAttachment,
  UserPromptAttachment,
} from "../components/ChatInput/types"

/**
 * Result of building prompt with attachments
 */
export interface PromptBuildResult {
  /** The text prompt to send to Claude */
  prompt: string
  /** URLs of images that should be fetched and sent as visual content to Claude */
  analyzeImageUrls: string[]
}

/**
 * Builds the final prompt with attachments:
 * - User prompts: Prepended to the message
 * - Uploaded files: Instructions to use Read tool to analyze
 * - Library images (website mode): Wrapped with structured context and usage instructions
 * - Library images (analyze mode): Treated as images for Claude to visually analyze
 * - Supertemplates: Appended as MCP tool triggers
 *
 * @returns Object with prompt text and URLs of images to analyze
 */
export function buildPromptWithAttachments(message: string, attachments: Attachment[]): string {
  return buildPromptWithAttachmentsEx(message, attachments).prompt
}

/**
 * Extended version that also returns analyze image URLs
 */
export function buildPromptWithAttachmentsEx(message: string, attachments: Attachment[]): PromptBuildResult {
  const uploadedFiles = attachments.filter((a): a is UploadedFileAttachment => a.kind === "uploaded-file")

  // Split library images by mode
  const allLibraryImages = attachments.filter((a): a is LibraryImageAttachment => a.kind === "library-image")
  const websiteImages = allLibraryImages.filter(a => a.mode !== "analyze")
  const analyzeImages = allLibraryImages.filter(a => a.mode === "analyze")

  const supertemplates = attachments.filter(a => a.kind === "supertemplate")

  // Support both new skill attachments and legacy user-prompt attachments
  const skillAttachments = attachments.filter((a): a is SkillAttachment => a.kind === "skill")
  const legacyUserPrompts = attachments.filter((a): a is UserPromptAttachment => a.kind === "user-prompt")

  // Start with user message
  let prompt = message

  // Prepend skill prompts at the very beginning (new unified skills)
  if (skillAttachments.length > 0) {
    const promptTexts = skillAttachments.map(s => s.prompt).join("\n\n")
    prompt = message.trim() ? `${promptTexts}\n\n${prompt}` : promptTexts
  }

  // Prepend legacy user prompts (for backward compatibility)
  if (legacyUserPrompts.length > 0) {
    const promptTexts = legacyUserPrompts.map(p => p.data).join("\n\n")
    prompt = prompt.trim() ? `${promptTexts}\n\n${prompt}` : promptTexts
  }

  // Add uploaded files context - these can be read with the Read tool
  if (uploadedFiles.length > 0) {
    const filesList = uploadedFiles
      .map(f => `  - ${f.originalName}: \`${f.workspacePath}\` (${f.mimeType}, ${formatFileSize(f.size)})`)
      .join("\n")

    prompt = `<uploaded_files>
The user has uploaded ${uploadedFiles.length} file${uploadedFiles.length > 1 ? "s" : ""} for you to analyze:

${filesList}

Use the Read tool to access and analyze these files. For example:
  Read({ file_path: "${uploadedFiles[0].workspacePath}" })

The Read tool supports images (visual analysis), PDFs (text extraction), and text files.
</uploaded_files>

${prompt}`
  }

  // Wrap with library images context if any exist (website mode only)
  if (websiteImages.length > 0) {
    const imagesList = websiteImages
      .map(img => {
        const [domain, hash] = img.photobookKey.split("/")
        if (!domain || !hash) {
          console.warn(`Invalid photobookKey format: ${img.photobookKey}`)
          return null
        }
        return `  - /_images/t/${domain}/o/${hash}/v/orig.webp`
      })
      .filter((url): url is string => url !== null)
      .join("\n")

    // Prepend images context and wrap original message
    prompt = `<images_attached>
The user has attached ${websiteImages.length} image${websiteImages.length > 1 ? "s" : ""} from their photobook:

${imagesList}

IMPORTANT: These are WEB URLs, NOT files in your workspace. Do NOT try to read, inspect, or access these files with Read, Glob, Grep, or Bash tools. They are already uploaded and served by the website's image server.

To use them, simply add them to the HTML/code with:
<img src="/_images/t/[domain]/o/[hash]/v/orig.webp" alt="..." />

The user is suggesting you might want to add ${websiteImages.length > 1 ? "these images" : "this image"} to the website.
</images_attached>

<user_message>
${prompt}
</user_message>`
  }

  // Collect analyze mode image URLs - server will fetch, save to .uploads/, and add Read instructions
  const analyzeImageUrls = analyzeImages
    .map(img => {
      const [domain, hash] = img.photobookKey.split("/")
      if (!domain || !hash) {
        console.warn(`Invalid photobookKey format: ${img.photobookKey}`)
        return null
      }
      // Use orig variant for best quality analysis
      return `/_images/t/${domain}/o/${hash}/v/orig.webp`
    })
    .filter((url): url is string => url !== null)

  // Append supertemplate triggers if any exist
  if (supertemplates.length > 0) {
    const supertemplateTriggers = supertemplates
      .map(t => `use the supertemplate tool (MCP) integrate this following into the website: ${t.templateId}`)
      .join("\n")
    prompt = `${prompt}\n\n${supertemplateTriggers}`
  }

  return { prompt, analyzeImageUrls }
}

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`
}
