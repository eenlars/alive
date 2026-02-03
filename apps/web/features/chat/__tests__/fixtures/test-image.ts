/**
 * Test image fixtures for upload tests
 * Creates minimal valid image files that don't take up much space
 */

/**
 * Creates a minimal 1x1 transparent PNG (67 bytes)
 * This is a valid PNG that can be uploaded and processed
 */
export function createTestPNG(): Buffer {
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

/**
 * Converts a Buffer to a File object (like browser File API)
 * This simulates what happens when a user drags a file from their computer
 */
export function bufferToFile(buffer: Buffer, filename: string, mimeType: string): File {
  const blob = new Blob([new Uint8Array(buffer)], { type: mimeType })
  return new File([blob], filename, { type: mimeType })
}

/**
 * Creates a test PNG File object ready for upload
 */
export function createTestImageFile(): File {
  const buffer = createTestPNG()
  return bufferToFile(buffer, "test-upload.png", "image/png")
}
