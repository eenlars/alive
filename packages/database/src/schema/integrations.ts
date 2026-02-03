/**
 * Integrations Schema - OAuth and External Service Integrations
 *
 * Tables for managing OAuth providers, access policies, and user tokens.
 */
import { relations } from "drizzle-orm"
import { boolean, foreignKey, index, jsonb, pgSchema, text, timestamp, unique, uuid } from "drizzle-orm/pg-core"

// Import IAM schema for foreign keys
import { users } from "./iam"

// Define the Integrations schema
export const integrationsSchema = pgSchema("integrations")

// ============================================================================
// TABLES
// ============================================================================

/**
 * Providers - OAuth/integration provider definitions
 * provider_id is UUID (matches production)
 */
export const providers = integrationsSchema.table(
  "providers",
  {
    providerId: uuid("provider_id").defaultRandom().primaryKey().notNull(),
    providerKey: text("provider_key").notNull(), // 'linear', 'gmail', 'stripe', etc.
    displayName: text("display_name").notNull(),
    logoPath: text("logo_path"),
    defaultScopes: jsonb("default_scopes").default([]),
    visibilityLevel: text("visibility_level").default("admin_only").notNull(), // 'public', 'beta', 'admin_only'
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow(),
  },
  table => [
    index("idx_providers_visibility").on(table.isActive, table.visibilityLevel),
    unique("providers_provider_key_key").on(table.providerKey),
  ],
)

/**
 * Access policies - Controls which users can access which providers
 */
export const accessPolicies = integrationsSchema.table(
  "access_policies",
  {
    policyId: uuid("policy_id").defaultRandom().primaryKey().notNull(),
    providerId: uuid("provider_id").notNull(),
    userId: text("user_id").notNull(), // User granted access
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow(),
  },
  table => [
    index("idx_policies_lookup").on(table.userId, table.providerId),
    foreignKey({
      columns: [table.providerId],
      foreignColumns: [providers.providerId],
      name: "access_policies_provider_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.userId],
      name: "access_policies_user_fk",
    }).onDelete("cascade"),
    unique("access_policies_provider_id_user_id_key").on(table.providerId, table.userId),
  ],
)

// ============================================================================
// RELATIONS
// ============================================================================

export const providersRelations = relations(providers, ({ many }) => ({
  accessPolicies: many(accessPolicies),
}))

export const accessPoliciesRelations = relations(accessPolicies, ({ one }) => ({
  provider: one(providers, {
    fields: [accessPolicies.providerId],
    references: [providers.providerId],
  }),
  user: one(users, {
    fields: [accessPolicies.userId],
    references: [users.userId],
  }),
}))
