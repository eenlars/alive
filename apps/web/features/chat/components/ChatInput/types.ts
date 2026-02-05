import type { ReactNode } from "react"
import type { FileCategory } from "./types/file-types"

// Base properties for all attachments
interface BaseAttachment {
  id: string
  preview?: string
  uploadProgress?: number
  error?: string
}

// File being uploaded (new or duplicate detection in progress)
export interface FileUploadAttachment extends BaseAttachment {
  kind: "file-upload"
  file: File
  category: FileCategory
}

// Image from photobook library (already uploaded)
export interface LibraryImageAttachment extends BaseAttachment {
  kind: "library-image"
  photobookKey: string
  /**
   * How this image should be used:
   * - "website": Add to website (default) - Claude gets URL only
   * - "analyze": Analyze content - Claude reads the actual image via Read tool
   */
  mode?: "website" | "analyze"
}

// SuperTemplate from templates modal
export interface SuperTemplateAttachment extends BaseAttachment {
  kind: "supertemplate"
  templateId: string // e.g., "carousel-thumbnails-v1.0.0"
  name: string // e.g., "Carousel with Thumbnails"
  // preview: inherited from BaseAttachment (template preview image URL)
}

// User Prompt template
/** @deprecated Use SkillAttachment instead */
export interface UserPromptAttachment extends BaseAttachment {
  kind: "user-prompt"
  promptType: string // e.g., "revise-code", "organize-code"
  data: string // The actual prompt text (sent to Claude SDK)
  displayName: string // e.g., "Revise Code", "Organize Code"
  userFacingDescription?: string // Short description shown to user in UI (instead of full prompt)
}

// Skill attachment (unified skills from API + user-created)
export interface SkillAttachment extends BaseAttachment {
  kind: "skill"
  /** Skill ID (e.g., "revise-code" or "user-123456") */
  skillId: string
  /** Human-readable display name */
  displayName: string
  /** Short description for UI chip */
  description: string
  /** Full prompt text to prepend to message */
  prompt: string
  /** Source: "global" (system), "user" (localStorage), "project" (workspace) */
  source: "global" | "user" | "project"
}

// File uploaded to workspace for SDK Read tool access
export interface UploadedFileAttachment extends BaseAttachment {
  kind: "uploaded-file"
  workspacePath: string // Path relative to workspace root, e.g., ".uploads/design-1234.png"
  originalName: string // Original filename before sanitization
  mimeType: string // MIME type for icon/preview hints
  size: number // File size in bytes
}

export type Attachment =
  | FileUploadAttachment
  | LibraryImageAttachment
  | SuperTemplateAttachment
  | UserPromptAttachment
  | SkillAttachment
  | UploadedFileAttachment

// Type guards
export function isFileUpload(attachment: Attachment): attachment is FileUploadAttachment {
  return attachment.kind === "file-upload"
}

export function isLibraryImage(attachment: Attachment): attachment is LibraryImageAttachment {
  return attachment.kind === "library-image"
}

export function isSuperTemplateAttachment(attachment: Attachment): attachment is SuperTemplateAttachment {
  return attachment.kind === "supertemplate"
}

/** @deprecated Use isSkillAttachment instead */
export function isUserPromptAttachment(attachment: Attachment): attachment is UserPromptAttachment {
  return attachment.kind === "user-prompt"
}

export function isSkillAttachment(attachment: Attachment): attachment is SkillAttachment {
  return attachment.kind === "skill"
}

export function isUploadedFile(attachment: Attachment): attachment is UploadedFileAttachment {
  return attachment.kind === "uploaded-file"
}

export function isImageAttachment(attachment: Attachment): boolean {
  if (attachment.kind === "library-image") return true
  if (attachment.kind === "file-upload" && attachment.category === "image") return true
  if (attachment.kind === "uploaded-file" && attachment.mimeType.startsWith("image/")) return true
  return false
}

export function isDocumentAttachment(attachment: Attachment): boolean {
  if (attachment.kind === "file-upload" && attachment.category === "document") return true
  if (attachment.kind === "uploaded-file" && !attachment.mimeType.startsWith("image/")) return true
  return false
}

export interface ChatInputState {
  // Text input
  message: string
  setMessage: (msg: string) => void

  // Attachments
  attachments: Attachment[]
  addAttachment: (file: File) => Promise<void>
  removeAttachment: (id: string) => void
  toggleImageMode: (id: string) => void

  // Loading states
  busy: boolean
  isStopping: boolean

  // Validation
  canSubmit: boolean
}

export interface ChatInputActions {
  onSubmit: () => void
  onStop: () => void
}

export type UploadProgressCallback = (attachmentId: string, progress: number) => void

export interface ChatInputConfig {
  // Feature flags
  enableAttachments?: boolean
  enableCamera?: boolean

  // Validation
  maxAttachments?: number
  maxFileSize?: number // bytes
  allowedFileTypes?: string[] // MIME types

  // UI customization
  placeholder?: string
  minHeight?: string
  maxHeight?: string

  // Callbacks
  onMessage?: (message: string, type: "info" | "error" | "success") => void
  onAttachmentUpload?: (file: File, onProgress?: (progress: number) => void) => Promise<string> // Returns image key
  workspace?: string
  worktree?: string | null
}

export interface ChatInputContextValue extends ChatInputState, ChatInputActions {
  config: ChatInputConfig
  /** Register the textarea ref for focus management */
  registerTextareaRef: (ref: HTMLTextAreaElement | null) => void
}

export interface ChatInputProps extends ChatInputActions {
  message: string
  setMessage: (msg: string) => void
  busy: boolean
  isStopping?: boolean
  /** Whether submitting is currently allowed (defaults to true) */
  isReady?: boolean
  config?: ChatInputConfig
  children?: ReactNode
  onOpenTemplates?: () => void
  hideToolbar?: boolean
}

export interface ChatInputHandle {
  addAttachment: (file: File) => Promise<void>
  addPhotobookImage: (imageKey: string) => void
  addSuperTemplateAttachment: (templateId: string, name: string, preview: string) => void
  /** @deprecated Use addSkill instead */
  addUserPrompt: (promptType: string, data: string, displayName: string, userFacingDescription?: string) => void
  /** Add a skill attachment */
  addSkill: (
    skillId: string,
    displayName: string,
    description: string,
    prompt: string,
    source: "global" | "user" | "project",
  ) => void
  addFileForAnalysis: (file: File, workspace?: string, worktree?: string | null) => Promise<void>
  getAttachments: () => Attachment[]
  clearLibraryImages: () => void
  clearAllAttachments: () => void
  focus: () => void
}
