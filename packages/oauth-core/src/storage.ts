/**
 * Storage Layer - Supabase Lockbox Adapter
 *
 * Handles encrypted secret storage via lockbox RPC functions in public schema.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { PublicDatabase as Database } from "@webalive/database"
import { getConfig } from "./config"
import { Security } from "./security"
import type { SecretNamespace, UserSecret } from "./types"

export interface LockboxAdapterConfig {
  instanceId?: string // Instance identifier for multi-tenant isolation
  defaultTtlSeconds?: number // Default TTL for secrets
}

export class LockboxAdapter {
  private supabase: SupabaseClient<Database, "public", "public">
  private instanceId: string
  private defaultTtlSeconds?: number

  constructor(config?: LockboxAdapterConfig) {
    const appConfig = getConfig()
    this.supabase = createClient<Database, "public">(appConfig.SUPABASE_URL, appConfig.SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema: "public" },
    })
    this.instanceId = config?.instanceId || "default"
    this.defaultTtlSeconds = config?.defaultTtlSeconds
  }

  /** Creates common RPC args for key-based operations */
  private lockboxKey(userId: string, namespace: SecretNamespace, name: string) {
    return {
      p_user_id: userId,
      p_instance_id: this.instanceId,
      p_namespace: namespace,
      p_name: name,
    }
  }

  /** Creates common RPC args for namespace list operations */
  private lockboxNamespace(userId: string, namespace: SecretNamespace) {
    return {
      p_user_id: userId,
      p_instance_id: this.instanceId,
      p_namespace: namespace,
    }
  }

  /** Formats error messages consistently */
  private logTag(name: string): string {
    return `[Lockbox] '${name}' (instance: ${this.instanceId})`
  }

  /**
   * Saves an encrypted secret using atomic rotation pattern
   */
  async save(userId: string, namespace: SecretNamespace, name: string, value: string): Promise<void> {
    const { ciphertext, iv, authTag } = Security.encrypt(value)
    const expiresAt = this.defaultTtlSeconds
      ? new Date(Date.now() + this.defaultTtlSeconds * 1000).toISOString()
      : undefined

    const { error } = await this.supabase.rpc("lockbox_save", {
      ...this.lockboxKey(userId, namespace, name),
      p_ciphertext: ciphertext,
      p_iv: iv,
      p_auth_tag: authTag,
      ...(expiresAt ? { p_expires_at: expiresAt } : {}),
    })

    if (error) {
      if (error.code === "23505") {
        throw new Error(`${this.logTag(name)}: Concurrent rotation detected. Please retry.`)
      }
      throw new Error(`${this.logTag(name)}: Save failed: ${error.message}`)
    }
  }

  /**
   * Retrieves and decrypts a secret
   */
  async get(userId: string, namespace: SecretNamespace, name: string): Promise<string | null> {
    const { data, error } = await this.supabase.rpc("lockbox_get", this.lockboxKey(userId, namespace, name))

    if (error) {
      throw new Error(`${this.logTag(name)}: Get failed: ${error.message}`)
    }

    const row = data?.[0]
    if (!row) return null

    try {
      return Security.decrypt(row.ciphertext, row.iv, row.auth_tag)
    } catch {
      console.error(`${this.logTag(name)}: Decryption failed`)
      return null
    }
  }

  /**
   * Deletes all versions of a secret
   */
  async delete(userId: string, namespace: SecretNamespace, name: string): Promise<void> {
    const { error } = await this.supabase.rpc("lockbox_delete", this.lockboxKey(userId, namespace, name))

    if (error) {
      throw new Error(`${this.logTag(name)}: Delete failed: ${error.message}`)
    }
  }

  /**
   * Lists all current secrets for a user in a namespace (metadata only)
   */
  async list(userId: string, namespace: SecretNamespace): Promise<UserSecret[]> {
    const { data, error } = await this.supabase.rpc("lockbox_list", this.lockboxNamespace(userId, namespace))

    if (error) {
      throw new Error(`[Lockbox] List failed (instance: ${this.instanceId}): ${error.message}`)
    }

    return (data || []).map(secret => ({
      ...secret,
      scope:
        typeof secret.scope === "string" ? secret.scope : secret.scope == null ? null : JSON.stringify(secret.scope),
      expires_at: secret.expires_at ?? null,
      last_used_at: secret.last_used_at ?? null,
      deleted_at: secret.deleted_at ?? null,
      created_by: secret.created_by ?? null,
      updated_by: secret.updated_by ?? null,
    }))
  }

  /**
   * Checks if a secret exists without decrypting it
   */
  async exists(userId: string, namespace: SecretNamespace, name: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc("lockbox_exists", this.lockboxKey(userId, namespace, name))

    if (error) {
      throw new Error(`${this.logTag(name)}: Exists check failed: ${error.message}`)
    }

    return Boolean(data)
  }
}
