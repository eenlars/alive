/**
 * Storage Layer - Supabase Lockbox Adapter
 *
 * Handles encrypted secret storage in lockbox.user_secrets table
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { LockboxDatabase as Database } from "@webalive/database"
import { getConfig } from "./config"
import { Security } from "./security"
import type { SecretNamespace, UserSecret } from "./types"

export interface LockboxAdapterConfig {
  instanceId?: string // Instance identifier for multi-tenant isolation
  defaultTtlSeconds?: number // Default TTL for secrets
}

type SecretKey = {
  user_id: string
  instance_id: string
  namespace: SecretNamespace
  name: string
}

export class LockboxAdapter {
  private supabase: SupabaseClient<Database, "lockbox", "lockbox">
  private instanceId: string
  private defaultTtlSeconds?: number

  constructor(config?: LockboxAdapterConfig) {
    const appConfig = getConfig()
    this.supabase = createClient<Database, "lockbox">(appConfig.SUPABASE_URL, appConfig.SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema: "lockbox" },
    })
    this.instanceId = config?.instanceId || "default"
    this.defaultTtlSeconds = config?.defaultTtlSeconds
  }

  /** Creates the common key matcher for a secret */
  private secretKey(userId: string, namespace: SecretNamespace, name: string): SecretKey {
    return { user_id: userId, instance_id: this.instanceId, namespace, name }
  }

  /** Formats error messages consistently */
  private logTag(name: string): string {
    return `[Lockbox] '${name}' (instance: ${this.instanceId})`
  }

  /** Demotes current secret before inserting a new version */
  private async demoteCurrent(key: SecretKey, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from("user_secrets")
      .update({
        is_current: false,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      })
      .match({ ...key, is_current: true })

    if (error) {
      console.warn(`${this.logTag(key.name)}: Failed to demote current secret:`, error)
    }
  }

  /** Demotes old versions after inserting a new current secret */
  private async demoteOldVersions(key: SecretKey, userId: string, excludeId: string): Promise<void> {
    const { error } = await this.supabase
      .from("user_secrets")
      .update({
        is_current: false,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      })
      .match({ ...key, is_current: true })
      .neq("user_secret_id", excludeId)

    if (error) {
      console.error(`${this.logTag(key.name)}: Failed to demote old versions:`, error)
    }
  }

  /** Gets the next version number for a secret */
  private async getNextVersion(key: SecretKey): Promise<number> {
    const { data, error } = await this.supabase
      .from("user_secrets")
      .select("version")
      .match(key)
      .order("version", { ascending: false })
      .limit(1)
      .single()

    // PGRST116 = no rows (expected for new secrets)
    if (error && error.code !== "PGRST116") {
      throw new Error(`${this.logTag(key.name)}: Failed to read version: ${error.message}`)
    }

    return data ? data.version + 1 : 1
  }

  /**
   * Saves an encrypted secret using atomic rotation pattern
   */
  async save(userId: string, namespace: SecretNamespace, name: string, value: string): Promise<void> {
    const key = this.secretKey(userId, namespace, name)
    const { ciphertext, iv, authTag } = Security.encrypt(value)
    const expiresAt = this.defaultTtlSeconds
      ? new Date(Date.now() + this.defaultTtlSeconds * 1000).toISOString()
      : undefined

    const nextVersion = await this.getNextVersion(key)

    // Demote current secret first to prevent unique constraint violation
    await this.demoteCurrent(key, userId)
    const { data: newSecret, error: insertError } = await this.supabase
      .from("user_secrets")
      .insert({
        ...key,
        ciphertext,
        iv,
        auth_tag: authTag,
        version: nextVersion,
        is_current: true,
        expires_at: expiresAt,
        created_by: userId,
        updated_by: userId,
      })
      .select("user_secret_id")
      .single()

    if (insertError) {
      if (insertError.code === "23505") {
        throw new Error(`${this.logTag(name)}: Concurrent rotation detected. Please retry.`)
      }
      throw new Error(`${this.logTag(name)}: Save failed: ${insertError.message}`)
    }

    // Demote old versions after successful insert
    if (newSecret) {
      await this.demoteOldVersions(key, userId, newSecret.user_secret_id)
    }
  }

  /**
   * Retrieves and decrypts a secret
   */
  async get(userId: string, namespace: SecretNamespace, name: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from("user_secrets")
      .select("ciphertext, iv, auth_tag")
      .match({ ...this.secretKey(userId, namespace, name), is_current: true })
      .limit(1)
      .single()

    if (error) {
      if (error.code === "PGRST116") return null
      throw new Error(`${this.logTag(name)}: Get failed: ${error.message}`)
    }

    if (!data) return null

    try {
      return Security.decrypt(data.ciphertext, data.iv, data.auth_tag)
    } catch {
      console.error(`${this.logTag(name)}: Decryption failed`)
      return null
    }
  }

  /**
   * Deletes all versions of a secret
   */
  async delete(userId: string, namespace: SecretNamespace, name: string): Promise<void> {
    const { error } = await this.supabase
      .from("user_secrets")
      .delete()
      .match(this.secretKey(userId, namespace, name))

    if (error) {
      throw new Error(`${this.logTag(name)}: Delete failed: ${error.message}`)
    }
  }

  /**
   * Lists all current secrets for a user in a namespace (metadata only)
   */
  async list(userId: string, namespace: SecretNamespace): Promise<UserSecret[]> {
    const { data, error } = await this.supabase
      .from("user_secrets")
      .select("*")
      .match({
        user_id: userId,
        instance_id: this.instanceId,
        namespace,
        is_current: true,
      })
      .order("created_at", { ascending: false })

    if (error) {
      throw new Error(`[Lockbox] List failed (instance: ${this.instanceId}): ${error.message}`)
    }

    return (data || []) as UserSecret[]
  }

  /**
   * Checks if a secret exists without decrypting it
   */
  async exists(userId: string, namespace: SecretNamespace, name: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from("user_secrets")
      .select("user_secret_id")
      .match({ ...this.secretKey(userId, namespace, name), is_current: true })
      .limit(1)
      .single()

    if (error) {
      if (error.code === "PGRST116") return false
      throw new Error(`${this.logTag(name)}: Exists check failed: ${error.message}`)
    }

    return !!data
  }
}
