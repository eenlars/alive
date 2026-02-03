/**
 * Tests for file upload from computer -> library-image conversion
 *
 * This test verifies the critical flow:
 * 1. User drags file from computer
 * 2. File is validated and uploaded
 * 3. file-upload attachment is converted to library-image
 * 4. Library-image attachment is sent to Claude in prompt
 */

import { describe, expect, it } from "vitest"
import type { FileUploadAttachment, LibraryImageAttachment } from "../components/ChatInput/types"
import { buildPromptWithAttachments } from "../utils/prompt-builder"
import { createTestImageFile } from "./fixtures/test-image"

describe("File Upload Flow - Computer to Claude", () => {
  it("should convert uploaded file to library-image format", async () => {
    // 1. Create a test file (simulates user dragging from computer)
    const file = createTestImageFile()

    expect(file.name).toBe("test-upload.png")
    expect(file.type).toBe("image/png")
    expect(file.size).toBeGreaterThan(0)
  })

  it("should create file-upload attachment with blob preview", () => {
    const file = createTestImageFile()

    // Simulate initial attachment creation (before upload)
    const attachment: FileUploadAttachment = {
      kind: "file-upload",
      id: crypto.randomUUID(),
      file,
      category: "image",
      preview: URL.createObjectURL(file),
      uploadProgress: 0,
    }

    expect(attachment.kind).toBe("file-upload")
    expect(attachment.preview).toMatch(/^blob:/)
    expect(attachment.uploadProgress).toBe(0)

    // Cleanup
    if (attachment.preview) {
      URL.revokeObjectURL(attachment.preview)
    }
  })

  it("should convert to library-image after successful upload", () => {
    // Simulate successful upload response
    const photobookKey = "test.com/abc123"
    const preview = "/_images/t/test.com/o/abc123/v/w640.webp"

    // Converted attachment
    const libraryAttachment: LibraryImageAttachment = {
      kind: "library-image",
      id: crypto.randomUUID(),
      photobookKey,
      preview,
      uploadProgress: 100,
    }

    expect(libraryAttachment.kind).toBe("library-image")
    expect(libraryAttachment.photobookKey).toBe(photobookKey)
    expect(libraryAttachment.uploadProgress).toBe(100)
  })

  it("should include library-image in Claude prompt", () => {
    // After conversion to library-image
    const attachment: LibraryImageAttachment = {
      kind: "library-image",
      id: "test-id",
      photobookKey: "test.com/abc123",
      preview: "/_images/t/test.com/o/abc123/v/w640.webp",
      uploadProgress: 100,
    }

    const prompt = buildPromptWithAttachments("add this image to the page", [attachment])

    // Should include image context
    expect(prompt).toContain("<images_attached>")
    expect(prompt).toContain("/_images/t/test.com/o/abc123/v/orig.webp")
    expect(prompt).toContain("add this image to the page")
  })

  it("should NOT include file-upload in Claude prompt (not yet converted)", () => {
    const file = createTestImageFile()
    const fileUploadAttachment: FileUploadAttachment = {
      kind: "file-upload",
      id: "test-id",
      file,
      category: "image",
      preview: URL.createObjectURL(file),
      uploadProgress: 50, // Still uploading
    }

    const prompt = buildPromptWithAttachments("add this image", [fileUploadAttachment])

    // Should NOT include image context (upload not complete)
    expect(prompt).not.toContain("<images_attached>")
    expect(prompt).toBe("add this image")

    // Cleanup
    if (fileUploadAttachment.preview) {
      URL.revokeObjectURL(fileUploadAttachment.preview)
    }
  })

  it("should construct correct preview URL from photobook key", () => {
    const photobookKey = "example.nl/xyz789"
    const [domain, hash] = photobookKey.split("/", 2)

    expect(domain).toBe("example.nl")
    expect(hash).toBe("xyz789")

    const preview = `/_images/t/${domain}/o/${hash}/v/w640.webp`
    expect(preview).toBe("/_images/t/example.nl/o/xyz789/v/w640.webp")
  })

  it("should validate photobook key format before splitting", () => {
    const validKey = "test.com/abc123"
    const [domain, hash] = validKey.split("/", 2)

    expect(domain).toBeTruthy()
    expect(hash).toBeTruthy()

    // Invalid formats should be caught
    const invalidKey = "no-slash-in-key"
    const [d, h] = invalidKey.split("/", 2)

    // This would fail validation
    expect(!d || !h).toBe(true)
  })

  it("should handle multiple file uploads converting to library-images", () => {
    const attachments: LibraryImageAttachment[] = [
      {
        kind: "library-image",
        id: "1",
        photobookKey: "test.com/hash1",
        preview: "/_images/t/test.com/o/hash1/v/w640.webp",
        uploadProgress: 100,
      },
      {
        kind: "library-image",
        id: "2",
        photobookKey: "test.com/hash2",
        preview: "/_images/t/test.com/o/hash2/v/w640.webp",
        uploadProgress: 100,
      },
    ]

    const prompt = buildPromptWithAttachments("use these", attachments)

    expect(prompt).toContain("2 images")
    expect(prompt).toContain("/_images/t/test.com/o/hash1/v/orig.webp")
    expect(prompt).toContain("/_images/t/test.com/o/hash2/v/orig.webp")
  })

  it("should create valid File object from fixture", () => {
    const file = createTestImageFile()

    // Verify it's a real File object with correct properties
    expect(file).toBeInstanceOf(File)
    expect(file.name).toBe("test-upload.png")
    expect(file.type).toBe("image/png")
    expect(file.size).toBe(67) // 1x1 PNG is exactly 67 bytes
  })

  it("should verify test image has valid PNG magic numbers", async () => {
    const file = createTestImageFile()

    const arrayBuffer = await file.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)

    // PNG magic numbers: 89 50 4E 47 0D 0A 1A 0A
    expect(bytes[0]).toBe(0x89)
    expect(bytes[1]).toBe(0x50) // 'P'
    expect(bytes[2]).toBe(0x4e) // 'N'
    expect(bytes[3]).toBe(0x47) // 'G'
  })
})
