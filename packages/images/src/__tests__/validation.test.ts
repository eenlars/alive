import { describe, expect, it } from "vitest"
import { getAllowedMimeTypes, validateImageType } from "../validation/magic-numbers.js"
import { MAX_FILE_SIZE, MIN_FILE_SIZE, validateFileSize } from "../validation/size-limits.js"

describe("Magic Number Validation", () => {
  it("should detect JPEG images", () => {
    const jpegSignature = Buffer.from([0xff, 0xd8, 0xff, 0xe0])
    expect(validateImageType(jpegSignature)).toBe("image/jpeg")
  })

  it("should detect PNG images", () => {
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])
    expect(validateImageType(pngSignature)).toBe("image/png")
  })

  it("should detect WebP images", () => {
    const webpSignature = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00])
    expect(validateImageType(webpSignature)).toBe("image/webp")
  })

  it("should detect GIF images", () => {
    const gifSignature = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
    expect(validateImageType(gifSignature)).toBe("image/gif")
  })

  it("should reject invalid file types", () => {
    const invalidSignature = Buffer.from([0x00, 0x00, 0x00, 0x00])
    expect(validateImageType(invalidSignature)).toBeNull()
  })

  it("should reject PHP files disguised as images", () => {
    // PHP file signature: <?php
    const phpSignature = Buffer.from([0x3c, 0x3f, 0x70, 0x68, 0x70])
    expect(validateImageType(phpSignature)).toBeNull()
  })

  it("should return list of allowed MIME types", () => {
    const allowed = getAllowedMimeTypes()
    expect(allowed).toContain("image/jpeg")
    expect(allowed).toContain("image/png")
    expect(allowed).toContain("image/webp")
    expect(allowed).toContain("image/gif")
  })
})

describe("File Size Validation", () => {
  it("should accept valid file sizes", () => {
    const validSize = 5 * 1024 * 1024 // 5MB
    expect(validateFileSize(validSize)).toBeNull()
  })

  it("should reject files that are too small", () => {
    const tooSmall = MIN_FILE_SIZE - 1
    const error = validateFileSize(tooSmall)
    expect(error).not.toBeNull()
    expect(error).toContain("too small")
  })

  it("should reject files that are too large", () => {
    const tooLarge = MAX_FILE_SIZE + 1
    const error = validateFileSize(tooLarge)
    expect(error).not.toBeNull()
    expect(error).toContain("too large")
  })

  it("should respect custom max size", () => {
    const customMax = 1024 * 1024 // 1MB
    const fileSize = 2 * 1024 * 1024 // 2MB

    const error = validateFileSize(fileSize, customMax)
    expect(error).not.toBeNull()
    expect(error).toContain("too large")
  })

  it("should accept files at exact boundaries", () => {
    expect(validateFileSize(MIN_FILE_SIZE)).toBeNull()
    expect(validateFileSize(MAX_FILE_SIZE)).toBeNull()
  })
})
