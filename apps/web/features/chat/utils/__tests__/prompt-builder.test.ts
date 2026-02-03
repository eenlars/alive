import { describe, expect, it } from "vitest"
import type { LibraryImageAttachment, UserPromptAttachment } from "../../components/ChatInput/types"
import { buildPromptWithAttachments } from "../prompt-builder"

describe("buildPromptWithAttachments - core contract", () => {
  it("should include library-image attachments in prompt", () => {
    const attachment: LibraryImageAttachment = {
      kind: "library-image",
      id: "test-id",
      photobookKey: "example.com/abc123",
      preview: "/_images/t/example.com/o/abc123/v/w640.webp",
      uploadProgress: 100,
    }

    const result = buildPromptWithAttachments("add this to the page", [attachment])

    expect(result).toContain("<images_attached>")
    expect(result).toContain("/_images/t/example.com/o/abc123/v/orig.webp")
    expect(result).toContain("add this to the page")
  })

  it("should NOT include file-upload attachments (not yet converted)", () => {
    const fileUploadAttachment = {
      kind: "file-upload" as const,
      id: "test-id",
      file: new File(["test"], "test.jpg"),
      category: "image" as const,
      preview: "blob:http://localhost/123",
      uploadProgress: 50,
    }

    const result = buildPromptWithAttachments("add this", [fileUploadAttachment])

    expect(result).not.toContain("<images_attached>")
    expect(result).toBe("add this")
  })

  it("should include multiple library-image attachments", () => {
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

    const result = buildPromptWithAttachments("use these", attachments)

    expect(result).toContain("2 images")
    expect(result).toContain("/_images/t/test.com/o/hash1/v/orig.webp")
    expect(result).toContain("/_images/t/test.com/o/hash2/v/orig.webp")
  })

  it("should construct correct orig.webp URLs from photobookKey", () => {
    const attachment: LibraryImageAttachment = {
      kind: "library-image",
      id: "test",
      photobookKey: "domain.nl/xyz789",
      preview: "/_images/t/domain.nl/o/xyz789/v/w640.webp",
      uploadProgress: 100,
    }

    const result = buildPromptWithAttachments("test", [attachment])

    expect(result).toContain("/_images/t/domain.nl/o/xyz789/v/orig.webp")
  })

  it("should tell Claude these are web URLs, not workspace files", () => {
    const attachment: LibraryImageAttachment = {
      kind: "library-image",
      id: "test",
      photobookKey: "test.com/hash",
      preview: "/_images/t/test.com/o/hash/v/w640.webp",
      uploadProgress: 100,
    }

    const result = buildPromptWithAttachments("test", [attachment])

    expect(result).toContain("WEB URLs, NOT files in your workspace")
    expect(result).toContain("Do NOT try to read, inspect, or access these files")
  })

  it("should prepend user prompt text to message", () => {
    const userPrompt: UserPromptAttachment = {
      kind: "user-prompt",
      id: "prompt-1",
      promptType: "organize-code",
      data: "organize the code better",
      displayName: "Organize Code",
      uploadProgress: 100,
    }

    const result = buildPromptWithAttachments("look at index.ts", [userPrompt])

    expect(result).toBe("organize the code better\n\nlook at index.ts")
  })

  it("should handle user prompt without additional message", () => {
    const userPrompt: UserPromptAttachment = {
      kind: "user-prompt",
      id: "prompt-1",
      promptType: "revise-code",
      data: "revise the code and find any things that might be wrong",
      displayName: "Revise Code",
      uploadProgress: 100,
    }

    const result = buildPromptWithAttachments("", [userPrompt])

    expect(result).toBe("revise the code and find any things that might be wrong")
  })

  it("should handle multiple user prompts", () => {
    const prompts: UserPromptAttachment[] = [
      {
        kind: "user-prompt",
        id: "1",
        promptType: "revise-code",
        data: "revise the code",
        displayName: "Revise Code",
        uploadProgress: 100,
      },
      {
        kind: "user-prompt",
        id: "2",
        promptType: "optimize",
        data: "optimize for performance",
        displayName: "Optimize",
        uploadProgress: 100,
      },
    ]

    const result = buildPromptWithAttachments("check the file", prompts)

    expect(result).toBe("revise the code\n\noptimize for performance\n\ncheck the file")
  })

  it("should combine user prompts with library images", () => {
    const userPrompt: UserPromptAttachment = {
      kind: "user-prompt",
      id: "prompt-1",
      promptType: "organize-code",
      data: "organize the code better",
      displayName: "Organize Code",
      uploadProgress: 100,
    }

    const image: LibraryImageAttachment = {
      kind: "library-image",
      id: "img-1",
      photobookKey: "test.com/abc",
      preview: "/_images/t/test.com/o/abc/v/w640.webp",
      uploadProgress: 100,
    }

    const result = buildPromptWithAttachments("add this image", [userPrompt, image])

    expect(result).toContain("organize the code better")
    expect(result).toContain("add this image")
    expect(result).toContain("<images_attached>")
    expect(result).toContain("/_images/t/test.com/o/abc/v/orig.webp")
  })
})
