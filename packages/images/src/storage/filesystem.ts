import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import type { HResponse } from "../types/response.js"
import { Rs } from "../types/response.js"
import type { ImageStorage } from "./interface.js"

export interface FilesystemStorageConfig {
  basePath: string
  signatureSecret?: string
}

/**
 * Filesystem implementation of ImageStorage
 * Stores images in content-addressed structure on local disk
 */
export class FilesystemStorage implements ImageStorage {
  private basePath: string
  private signatureSecret: string

  constructor(config: FilesystemStorageConfig) {
    this.basePath = config.basePath
    this.signatureSecret = config.signatureSecret || "default-secret-change-in-production"
  }

  async put(tenantId: string, contentHash: string, variant: string, data: Buffer): HResponse<string> {
    try {
      const key = `t/${tenantId}/o/${contentHash}/v/${variant}.webp`
      const fullPath = path.join(this.basePath, key)

      // Ensure directory exists
      await fs.mkdir(path.dirname(fullPath), { recursive: true })

      // Write file
      await fs.writeFile(fullPath, data)

      return Rs.data(key)
    } catch (error) {
      return Rs.fromError(error, "fs:put")
    }
  }

  async get(key: string): HResponse<Buffer | null> {
    try {
      const fullPath = path.join(this.basePath, key)

      // Check if file exists
      try {
        await fs.access(fullPath)
      } catch {
        return Rs.data(null)
      }

      // Read file
      const data = await fs.readFile(fullPath)
      return Rs.data(data)
    } catch (error) {
      return Rs.fromError(error, "fs:get")
    }
  }

  async delete(key: string): HResponse<void> {
    try {
      const fullPath = path.join(this.basePath, key)

      // Delete file (ignore if doesn't exist)
      try {
        await fs.unlink(fullPath)
      } catch (error: any) {
        if (error.code !== "ENOENT") {
          throw error
        }
      }

      return Rs.data(undefined)
    } catch (error) {
      return Rs.fromError(error, "fs:delete")
    }
  }

  async list(tenantId: string, prefix?: string): HResponse<string[]> {
    try {
      const tenantPath = path.join(this.basePath, "t", tenantId)

      // Check if tenant directory exists
      try {
        await fs.access(tenantPath)
      } catch {
        return Rs.data([])
      }

      // Recursively find all .webp files
      const files = await this.findFiles(tenantPath, ".webp")

      // Convert absolute paths to relative keys
      const keys = files.map(file => {
        const relativePath = path.relative(this.basePath, file)
        return relativePath.split(path.sep).join("/") // Normalize to forward slashes
      })

      // Apply prefix filter if provided
      if (prefix) {
        return Rs.data(keys.filter(key => key.includes(prefix)))
      }

      return Rs.data(keys)
    } catch (error) {
      return Rs.fromError(error, "fs:list")
    }
  }

  async getSignedUrl(key: string, expiresIn: number): HResponse<string> {
    try {
      const expiry = Math.floor(Date.now() / 1000) + expiresIn

      // Generate HMAC signature
      const signature = crypto.createHmac("sha256", this.signatureSecret).update(`${key}:${expiry}`).digest("hex")

      // Return signed URL query parameters
      const signedUrl = `?key=${encodeURIComponent(key)}&sig=${signature}&exp=${expiry}`

      return Rs.data(signedUrl)
    } catch (error) {
      return Rs.fromError(error, "fs:sign")
    }
  }

  /**
   * Verify signed URL signature
   */
  verifySignature(key: string, signature: string, expiry: number): boolean {
    // Check expiry
    if (Math.floor(Date.now() / 1000) > expiry) {
      return false
    }

    // Generate expected signature
    const expected = crypto.createHmac("sha256", this.signatureSecret).update(`${key}:${expiry}`).digest("hex")

    // Constant-time comparison
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  }

  /**
   * Recursively find files with extension
   */
  private async findFiles(dir: string, ext: string): Promise<string[]> {
    const results: string[] = []

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)

        if (entry.isDirectory()) {
          const subFiles = await this.findFiles(fullPath, ext)
          results.push(...subFiles)
        } else if (entry.isFile() && entry.name.endsWith(ext)) {
          results.push(fullPath)
        }
      }
    } catch {
      // Ignore errors (directory might not exist)
    }

    return results
  }
}
