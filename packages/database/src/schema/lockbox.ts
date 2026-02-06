/**
 * Lockbox Schema - Encrypted Secret Storage
 *
 * Tables for storing encrypted user secrets using AES-256-GCM.
 * Production uses bytea for ciphertext/iv/auth_tag; open source can use text (base64).
 */
import { relations, sql } from "drizzle-orm"
import {
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

// Import IAM schema for foreign keys
import { users } from "./iam"

// Define the Lockbox schema
export const lockboxSchema = pgSchema("lockbox")

// Custom bytea type for binary data
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea"
  },
})

// ============================================================================
// TABLES
// ============================================================================

/**
 * User secrets - Encrypted secrets per user (OAuth tokens, API keys, etc.)
 * Uses AES-256-GCM encryption with IV and auth tag
 */
export const userSecrets = lockboxSchema.table(
  "user_secrets",
  {
    userSecretId: uuid("user_secret_id").defaultRandom().primaryKey().notNull(),
    userId: text("user_id").notNull(),
    instanceId: text("instance_id").default("default").notNull(),
    namespace: text("namespace").default("default").notNull(),
    name: text("name").notNull(), // Production uses citext for case-insensitive
    ciphertext: bytea("ciphertext").notNull(),
    iv: bytea("iv").notNull(),
    authTag: bytea("auth_tag").notNull(),
    scope: jsonb("scope").default({}).notNull(),
    version: integer("version").default(1).notNull(),
    isCurrent: boolean("is_current").default(true).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "string" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  table => [
    index("idx_user_secrets_expires_at").on(table.expiresAt).where(sql`(expires_at IS NOT NULL)`),
    uniqueIndex("user_secrets_instance_version_idx").on(
      table.userId,
      table.instanceId,
      table.namespace,
      table.name,
      table.version,
    ),
    uniqueIndex("user_secrets_one_current_per_instance_idx")
      .on(table.userId, table.instanceId, table.namespace, table.name)
      .where(sql`(is_current = true)`),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.userId],
      name: "user_secrets_user_fk",
    }).onDelete("cascade"),
    check("user_secrets_auth_tag_check", sql`octet_length(auth_tag) = 16`),
    check("user_secrets_iv_check", sql`octet_length(iv) = 12`),
    check("user_secrets_name_check", sql`(char_length(name) >= 1) AND (char_length(name) <= 128)`),
    check("user_secrets_version_check", sql`version > 0`),
  ],
)

/**
 * Secret keys - API keys for programmatic access
 * Stores hashed keys (not the actual secret)
 */
export const secretKeys = lockboxSchema.table(
  "secret_keys",
  {
    secretId: uuid("secret_id").defaultRandom().primaryKey().notNull(),
    userId: text("user_id").notNull(),
    instanceId: text("instance_id").default("default").notNull(),
    keyId: text("key_id").notNull(), // Public key identifier
    name: text("name").notNull(), // Human-readable name
    secretHash: text("secret_hash").notNull(), // Hashed secret for verification
    scopes: jsonb("scopes").default([]).notNull(),
    environment: text("environment").default("live").notNull(),
    rateLimitPm: integer("rate_limit_pm"), // Rate limit per minute
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "string" }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "string" }),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  table => [
    index("idx_secret_keys_secret_hash").on(table.secretHash),
    index("secret_keys_user_idx").on(table.userId),
    index("secret_keys_user_instance_idx").on(table.userId, table.instanceId),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.userId],
      name: "secret_keys_user_fk",
    }).onDelete("cascade"),
    unique("secret_keys_key_id_key").on(table.keyId),
    check("secret_keys_env_len_check", sql`char_length(environment) > 0`),
    check("secret_keys_name_check", sql`(char_length(name) >= 1) AND (char_length(name) <= 128)`),
  ],
)

// ============================================================================
// RELATIONS
// ============================================================================

export const userSecretsRelations = relations(userSecrets, ({ one }) => ({
  user: one(users, {
    fields: [userSecrets.userId],
    references: [users.userId],
  }),
}))

export const secretKeysRelations = relations(secretKeys, ({ one }) => ({
  user: one(users, {
    fields: [secretKeys.userId],
    references: [users.userId],
  }),
}))
