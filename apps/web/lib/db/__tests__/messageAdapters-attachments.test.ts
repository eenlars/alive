import { describe, expect, it } from "vitest"
import type {
  Attachment,
  LibraryImageAttachment,
  UploadedFileAttachment,
} from "@/features/chat/components/ChatInput/types"
import type { UIMessage } from "@/features/chat/lib/message-parser"
import { toDbMessage, toUIMessage } from "@/lib/db/messageAdapters"

describe("Attachment Persistence", () => {
  it("should persist library image attachments", () => {
    const imageAttachment: LibraryImageAttachment = {
      kind: "library-image",
      id: "img-123",
      photobookKey: "domain.com/abc123def",
      preview: "data:image/webp;base64,xyz",
      mode: "analyze",
    }

    const userMessage: UIMessage = {
      id: "msg-1",
      type: "user",
      content: "Check this image",
      timestamp: new Date(),
      attachments: [imageAttachment],
    }

    // Convert to DB format
    const dbMessage = toDbMessage(userMessage, "tab-1", 1)

    // Verify attachments are stored
    expect(dbMessage.attachments).toBeDefined()
    expect(dbMessage.attachments?.[0]).toMatchObject({
      kind: "library-image",
      id: "img-123",
      photobookKey: "domain.com/abc123def",
      preview: "data:image/webp;base64,xyz",
      mode: "analyze",
    })

    // Convert back to UI format
    const restoredMessage = toUIMessage(dbMessage)

    // Verify attachments are restored
    expect(restoredMessage.attachments).toBeDefined()
    expect(restoredMessage.attachments).toHaveLength(1)
    expect(restoredMessage.attachments?.[0]).toMatchObject({
      kind: "library-image",
      id: "img-123",
      photobookKey: "domain.com/abc123def",
      mode: "analyze",
    })
  })

  it("should persist uploaded file attachments", () => {
    const fileAttachment: UploadedFileAttachment = {
      kind: "uploaded-file",
      id: "file-456",
      workspacePath: ".uploads/design.png",
      originalName: "design.png",
      mimeType: "image/png",
      size: 102400,
      preview: "data:image/png;base64,abc",
    }

    const userMessage: UIMessage = {
      id: "msg-2",
      type: "user",
      content: "Review the design",
      timestamp: new Date(),
      attachments: [fileAttachment],
    }

    // Convert to DB format
    const dbMessage = toDbMessage(userMessage, "tab-1", 2)

    // Verify attachments are stored
    expect(dbMessage.attachments).toBeDefined()
    expect(dbMessage.attachments?.[0]).toMatchObject({
      kind: "uploaded-file",
      id: "file-456",
      workspacePath: ".uploads/design.png",
      originalName: "design.png",
      mimeType: "image/png",
      size: 102400,
    })

    // Convert back
    const restoredMessage = toUIMessage(dbMessage)
    expect(restoredMessage.attachments).toHaveLength(1)
    expect(restoredMessage.attachments?.[0]).toMatchObject({
      kind: "uploaded-file",
      id: "file-456",
      workspacePath: ".uploads/design.png",
      originalName: "design.png",
      mimeType: "image/png",
      size: 102400,
    })
  })

  it("should handle messages without attachments", () => {
    const userMessage: UIMessage = {
      id: "msg-3",
      type: "user",
      content: "No attachments here",
      timestamp: new Date(),
    }

    const dbMessage = toDbMessage(userMessage, "tab-1", 3)
    expect(dbMessage.attachments).toBeUndefined()

    const restoredMessage = toUIMessage(dbMessage)
    expect(restoredMessage.attachments).toBeUndefined()
  })

  it("should drop transient fields like uploadProgress and error", () => {
    const attachmentWithTransient = {
      kind: "library-image",
      id: "img-789",
      photobookKey: "domain.com/xyz",
      preview: "data:image/webp;base64,",
      uploadProgress: 100, // Should be dropped
      error: undefined, // Should be dropped
    } as unknown as Attachment

    const userMessage: UIMessage = {
      id: "msg-4",
      type: "user",
      content: "Test transient fields",
      timestamp: new Date(),
      attachments: [attachmentWithTransient],
    }

    const dbMessage = toDbMessage(userMessage, "tab-1", 4)

    // Verify transient fields are not stored
    expect(dbMessage.attachments?.[0]).not.toHaveProperty("uploadProgress")
    expect(dbMessage.attachments?.[0]).not.toHaveProperty("error")

    // But essential fields are there
    expect(dbMessage.attachments?.[0]).toMatchObject({
      kind: "library-image",
      id: "img-789",
      photobookKey: "domain.com/xyz",
    })
  })
})
