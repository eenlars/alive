import { describe, expect, it } from "vitest"
import { generateContentHash } from "../core/hash.js"

describe("Content Hashing", () => {
  it("should generate consistent hashes for same content", () => {
    const buffer = Buffer.from("test content")

    const hash1 = generateContentHash(buffer)
    const hash2 = generateContentHash(buffer)

    expect(hash1).toBe(hash2)
  })

  it("should generate different hashes for different content", () => {
    const buffer1 = Buffer.from("test content 1")
    const buffer2 = Buffer.from("test content 2")

    const hash1 = generateContentHash(buffer1)
    const hash2 = generateContentHash(buffer2)

    expect(hash1).not.toBe(hash2)
  })

  it("should generate 16-character hashes", () => {
    const buffer = Buffer.from("test content")
    const hash = generateContentHash(buffer)

    expect(hash).toHaveLength(16)
  })

  it("should generate hexadecimal hashes", () => {
    const buffer = Buffer.from("test content")
    const hash = generateContentHash(buffer)

    expect(hash).toMatch(/^[0-9a-f]{16}$/)
  })

  it("should handle empty buffers", () => {
    const buffer = Buffer.from("")
    const hash = generateContentHash(buffer)

    expect(hash).toHaveLength(16)
    expect(hash).toMatch(/^[0-9a-f]{16}$/)
  })

  it("should handle large buffers", () => {
    const buffer = Buffer.alloc(10 * 1024 * 1024) // 10MB
    const hash = generateContentHash(buffer)

    expect(hash).toHaveLength(16)
  })
})
