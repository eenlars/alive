import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { FilesystemStorage } from "../storage/filesystem.js"

describe("FilesystemStorage", () => {
  let storage: FilesystemStorage
  let tempDir: string

  beforeEach(async () => {
    // Create temporary directory for tests
    tempDir = path.join(os.tmpdir(), `images-test-${Date.now()}`)
    await fs.mkdir(tempDir, { recursive: true })

    storage = new FilesystemStorage({
      basePath: tempDir,
      signatureSecret: "test-secret",
    })
  })

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  describe("put", () => {
    it("should store file and return key", async () => {
      const data = Buffer.from("test image data")
      const result = await storage.put("tenant1", "hash123", "orig", data)

      expect(result.error).toBeNull()
      expect(result.data).toBe("t/tenant1/o/hash123/v/orig.webp")
    })

    it("should create directories if they do not exist", async () => {
      const data = Buffer.from("test image data")
      await storage.put("new-tenant", "new-hash", "orig", data)

      const fullPath = path.join(tempDir, "t/new-tenant/o/new-hash/v/orig.webp")
      const exists = await fs
        .access(fullPath)
        .then(() => true)
        .catch(() => false)

      expect(exists).toBe(true)
    })

    it("should write correct data to file", async () => {
      const data = Buffer.from("test image data")
      const result = await storage.put("tenant1", "hash123", "orig", data)

      if (result.error) throw new Error(result.error.message)

      const fullPath = path.join(tempDir, result.data)
      const stored = await fs.readFile(fullPath)

      expect(stored.toString()).toBe(data.toString())
    })
  })

  describe("get", () => {
    it("should retrieve stored file", async () => {
      const data = Buffer.from("test image data")
      const putResult = await storage.put("tenant1", "hash123", "orig", data)

      if (putResult.error) throw new Error(putResult.error.message)

      const getResult = await storage.get(putResult.data)

      expect(getResult.error).toBeNull()
      expect(getResult.data).toEqual(data)
    })

    it("should return null for non-existent file", async () => {
      const result = await storage.get("t/tenant1/o/nonexistent/v/orig.webp")

      expect(result.error).toBeNull()
      expect(result.data).toBeNull()
    })
  })

  describe("delete", () => {
    it("should delete existing file", async () => {
      const data = Buffer.from("test image data")
      const putResult = await storage.put("tenant1", "hash123", "orig", data)

      if (putResult.error) throw new Error(putResult.error.message)

      const deleteResult = await storage.delete(putResult.data)
      expect(deleteResult.error).toBeNull()

      const getResult = await storage.get(putResult.data)
      expect(getResult.data).toBeNull()
    })

    it("should not error when deleting non-existent file", async () => {
      const result = await storage.delete("t/tenant1/o/nonexistent/v/orig.webp")
      expect(result.error).toBeNull()
    })
  })

  describe("list", () => {
    it("should list files for tenant", async () => {
      // Create multiple files
      await storage.put("tenant1", "hash1", "orig", Buffer.from("data1"))
      await storage.put("tenant1", "hash2", "orig", Buffer.from("data2"))
      await storage.put("tenant1", "hash2", "thumb", Buffer.from("data3"))

      const result = await storage.list("tenant1")

      expect(result.error).toBeNull()
      expect(result.data).toHaveLength(3)
      expect(result.data).toContain("t/tenant1/o/hash1/v/orig.webp")
      expect(result.data).toContain("t/tenant1/o/hash2/v/orig.webp")
      expect(result.data).toContain("t/tenant1/o/hash2/v/thumb.webp")
    })

    it("should not list files from other tenants", async () => {
      await storage.put("tenant1", "hash1", "orig", Buffer.from("data1"))
      await storage.put("tenant2", "hash2", "orig", Buffer.from("data2"))

      const result = await storage.list("tenant1")

      expect(result.error).toBeNull()
      if (result.error) throw new Error("Expected no error")

      expect(result.data).toHaveLength(1)
      expect(result.data[0]).toContain("tenant1")
      expect(result.data[0]).not.toContain("tenant2")
    })

    it("should return empty array for tenant with no files", async () => {
      const result = await storage.list("empty-tenant")

      expect(result.error).toBeNull()
      expect(result.data).toEqual([])
    })

    it("should filter by prefix", async () => {
      await storage.put("tenant1", "hash1", "orig", Buffer.from("data1"))
      await storage.put("tenant1", "hash1", "thumb", Buffer.from("data2"))

      const result = await storage.list("tenant1", "thumb")

      expect(result.error).toBeNull()
      if (result.error) throw new Error("Expected no error")

      expect(result.data).toHaveLength(1)
      expect(result.data[0]).toContain("thumb")
    })
  })

  describe("getSignedUrl", () => {
    it("should generate signed URL with query parameters", async () => {
      const key = "t/tenant1/o/hash123/v/orig.webp"
      const result = await storage.getSignedUrl(key, 3600)

      expect(result.error).toBeNull()
      expect(result.data).toContain("?key=")
      expect(result.data).toContain("&sig=")
      expect(result.data).toContain("&exp=")
    })

    it("should generate different signatures for different keys", async () => {
      const key1 = "t/tenant1/o/hash1/v/orig.webp"
      const key2 = "t/tenant1/o/hash2/v/orig.webp"

      const result1 = await storage.getSignedUrl(key1, 3600)
      const result2 = await storage.getSignedUrl(key2, 3600)

      expect(result1.data).not.toBe(result2.data)
    })
  })

  describe("verifySignature", () => {
    it("should verify valid signatures", async () => {
      const key = "t/tenant1/o/hash123/v/orig.webp"
      const result = await storage.getSignedUrl(key, 3600)

      if (result.error) throw new Error(result.error.message)

      // Parse query parameters
      const params = new URLSearchParams(result.data)
      const signature = params.get("sig")!
      const expiry = Number.parseInt(params.get("exp")!, 10)

      const isValid = storage.verifySignature(key, signature, expiry)
      expect(isValid).toBe(true)
    })

    it("should reject invalid signatures", () => {
      const key = "t/tenant1/o/hash123/v/orig.webp"
      // Generate a valid-length but wrong signature (64 hex chars = 32 bytes)
      const invalidSig = "a".repeat(64)
      const expiry = Math.floor(Date.now() / 1000) + 3600

      const isValid = storage.verifySignature(key, invalidSig, expiry)
      expect(isValid).toBe(false)
    })

    it("should reject expired signatures", async () => {
      const key = "t/tenant1/o/hash123/v/orig.webp"
      const result = await storage.getSignedUrl(key, -10) // Already expired

      if (result.error) throw new Error(result.error.message)

      const params = new URLSearchParams(result.data)
      const signature = params.get("sig")!
      const expiry = Number.parseInt(params.get("exp")!, 10)

      const isValid = storage.verifySignature(key, signature, expiry)
      expect(isValid).toBe(false)
    })
  })
})
