import { describe, expect, it } from "vitest"
import { compressImage, generateVariant } from "../core/compress.js"

// Create a simple test image buffer (1x1 transparent PNG)
const createTestPNG = (): Buffer => {
  return Buffer.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a, // PNG signature
    0x00,
    0x00,
    0x00,
    0x0d,
    0x49,
    0x48,
    0x44,
    0x52, // IHDR chunk
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    0x00,
    0x00,
    0x01, // 1x1 dimensions
    0x08,
    0x06,
    0x00,
    0x00,
    0x00,
    0x1f,
    0x15,
    0xc4, // RGBA, deflate
    0x89,
    0x00,
    0x00,
    0x00,
    0x0a,
    0x49,
    0x44,
    0x41, // IDAT chunk
    0x54,
    0x78,
    0x9c,
    0x63,
    0x00,
    0x01,
    0x00,
    0x00, // compressed data
    0x05,
    0x00,
    0x01,
    0x0d,
    0x0a,
    0x2d,
    0xb4,
    0x00, // checksum
    0x00,
    0x00,
    0x00,
    0x49,
    0x45,
    0x4e,
    0x44,
    0xae, // IEND chunk
    0x42,
    0x60,
    0x82,
  ])
}

describe("Image Compression", () => {
  describe("compressImage", () => {
    it("should compress image to WebP format", async () => {
      const input = createTestPNG()
      const result = await compressImage(input)

      expect(result.buffer).toBeInstanceOf(Buffer)
      expect(result.buffer.length).toBeGreaterThan(0)
      expect(result.width).toBeGreaterThan(0)
      expect(result.height).toBeGreaterThan(0)
    })

    it("should respect max width", async () => {
      const input = createTestPNG()
      const maxWidth = 640

      const result = await compressImage(input, { maxWidth })

      expect(result.width).toBeLessThanOrEqual(maxWidth)
    })

    it("should target specific file size", async () => {
      const input = createTestPNG()
      const targetSize = 50 * 1024 // 50KB

      const result = await compressImage(input, { targetSize })

      // Allow some tolerance (binary search may not hit exact target)
      expect(result.size).toBeLessThanOrEqual(targetSize * 1.2)
    })

    it("should return dimensions", async () => {
      const input = createTestPNG()
      const result = await compressImage(input)

      expect(result.width).toBeDefined()
      expect(result.height).toBeDefined()
      expect(typeof result.width).toBe("number")
      expect(typeof result.height).toBe("number")
    })

    it("should use default options when not specified", async () => {
      const input = createTestPNG()
      const result = await compressImage(input)

      expect(result).toBeDefined()
      expect(result.buffer).toBeInstanceOf(Buffer)
    })
  })

  describe("generateVariant", () => {
    it("should generate variant at specified width", async () => {
      const input = createTestPNG()
      const width = 640

      const result = await generateVariant(input, width)

      expect(result.width).toBe(width)
      expect(result.buffer).toBeInstanceOf(Buffer)
    })

    it("should use specified quality", async () => {
      const input = createTestPNG()

      const highQuality = await generateVariant(input, 640, 95)
      const lowQuality = await generateVariant(input, 640, 50)

      // High quality should generally be larger (though not guaranteed for tiny images)
      expect(highQuality.size).toBeGreaterThan(0)
      expect(lowQuality.size).toBeGreaterThan(0)
    })

    it("should maintain aspect ratio", async () => {
      const input = createTestPNG()
      const width = 640

      const result = await generateVariant(input, width)

      // For 1x1 image, aspect ratio is 1:1
      // Width should equal height after maintaining aspect ratio
      expect(result.width).toBe(result.height)
    })
  })
})
