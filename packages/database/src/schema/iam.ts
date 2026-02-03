/**
 * IAM Schema - Identity and Access Management
 *
 * Core tables for users, organizations, memberships, and sessions.
 * This is the foundation of the multi-tenant architecture.
 *
 * Note: All IDs are TEXT with gen_prefixed_id() defaults (e.g., user_xxx, org_xxx)
 * This matches the production Supabase database.
 */
import { relations, sql } from "drizzle-orm"
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

// Define the IAM schema
export const iamSchema = pgSchema("iam")

// ============================================================================
// ENUMS (in iam schema)
// ============================================================================

export const orgRoleEnum = iamSchema.enum("org_role", ["owner", "admin", "member"])
export const userStatusEnum = iamSchema.enum("user_status", ["active", "disabled", "invited"])

// ============================================================================
// TABLES
// ============================================================================

/**
 * Users table - Core user identity
 * user_id is TEXT with gen_prefixed_id('user_') default
 */
export const users = iamSchema.table(
  "users",
  {
    userId: text("user_id").default(sql`gen_prefixed_id('user_'::text)`).primaryKey().notNull(),
    email: text("email"),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    passwordHash: text("password_hash"),
    clerkId: text("clerk_id"), // Legacy Clerk integration
    emailVerified: boolean("email_verified").default(false),
    inviteCode: text("invite_code"),
    status: userStatusEnum("status").default("active").notNull(),
    isTestEnv: boolean("is_test_env").default(false).notNull(),
    testRunId: text("test_run_id"), // For E2E test isolation
    metadata: jsonb("metadata").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  table => [
    index("idx_users_clerk_id").on(table.clerkId).where(sql`(clerk_id IS NOT NULL)`),
    uniqueIndex("idx_users_email_ci").on(sql`lower(email)`).where(sql`(email IS NOT NULL)`),
    index("idx_users_invite_code").on(table.inviteCode),
    index("idx_users_is_test_env").on(table.isTestEnv),
    index("idx_users_status").on(table.status),
    index("idx_users_test_run_id").on(table.testRunId),
    unique("users_email_key").on(table.email),
    unique("users_invite_code_key").on(table.inviteCode),
  ],
)

/**
 * Organizations table - Multi-tenant containers
 * org_id is TEXT with gen_prefixed_id('org_') default
 */
export const orgs = iamSchema.table(
  "orgs",
  {
    orgId: text("org_id").default(sql`gen_prefixed_id('org_'::text)`).primaryKey().notNull(),
    name: text("name").notNull(),
    credits: numeric("credits").default("200").notNull(),
    isTestEnv: boolean("is_test_env").default(false),
    testRunId: text("test_run_id"), // For E2E test isolation
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow(),
  },
  table => [
    index("idx_orgs_is_test_env").on(table.isTestEnv),
    index("idx_orgs_name_ci").on(sql`lower(name)`),
    index("idx_orgs_test_run_id").on(table.testRunId),
  ],
)

/**
 * Organization memberships - Links users to organizations
 * Composite primary key: (org_id, user_id)
 */
export const orgMemberships = iamSchema.table(
  "org_memberships",
  {
    orgId: text("org_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role").default("member").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow(),
  },
  table => [
    index("idx_org_memberships_org").on(table.orgId),
    index("idx_org_memberships_org_role").on(table.orgId, table.role),
    index("idx_org_memberships_user").on(table.userId),
    foreignKey({
      columns: [table.orgId],
      foreignColumns: [orgs.orgId],
      name: "org_memberships_org_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.userId],
      name: "org_memberships_user_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.orgId, table.userId], name: "org_memberships_pkey" }),
    check("org_memberships_role_check", sql`role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])`),
  ],
)

/**
 * Sessions table - Claude SDK conversation sessions
 * session_id is UUID, but user_id and domain_id are TEXT references
 */
export const sessions = iamSchema.table(
  "sessions",
  {
    sessionId: uuid("session_id").defaultRandom().primaryKey().notNull(),
    userId: text("user_id").notNull(),
    domainId: text("domain_id").notNull(), // References app.domains(domain_id)
    tabId: text("tab_id").notNull(),
    sdkSessionId: text("sdk_session_id").notNull(),
    lastActivity: timestamp("last_activity", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  table => [
    index("idx_sessions_domain").on(table.domainId),
    index("idx_sessions_expires_at").on(table.expiresAt),
    index("idx_sessions_sdk_session").on(table.sdkSessionId),
    index("idx_sessions_user").on(table.userId),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.userId],
      name: "sessions_user_id_fkey",
    }).onDelete("cascade"),
    // Note: domain_id FK is added via separate migration due to cross-schema dependency
    unique("sessions_user_id_domain_id_tab_id_key").on(table.userId, table.domainId, table.tabId),
  ],
)

/**
 * User preferences - User settings and workspace preferences
 */
export const userPreferences = iamSchema.table(
  "user_preferences",
  {
    userId: text("user_id").primaryKey().notNull(),
    currentWorkspace: text("current_workspace"),
    selectedOrgId: text("selected_org_id"),
    recentWorkspaces: jsonb("recent_workspaces").default([]).notNull(),
    preferences: jsonb("preferences").default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  table => [
    index("idx_user_preferences_org").on(table.selectedOrgId),
    foreignKey({
      columns: [table.selectedOrgId],
      foreignColumns: [orgs.orgId],
      name: "user_preferences_selected_org_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.userId],
      name: "user_preferences_user_id_fkey",
    }).onDelete("cascade"),
  ],
)

/**
 * Organization invites - Pending invitations to join orgs
 */
export const orgInvites = iamSchema.table(
  "org_invites",
  {
    inviteId: text("invite_id").default(sql`gen_prefixed_id('invite_'::text)`).notNull(),
    orgId: text("org_id").notNull(),
    email: text("email").notNull(), // Production uses citext, but text works for open source
    role: orgRoleEnum("role").default("member").notNull(),
    invitedBy: text("invited_by"),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  table => [
    index("idx_org_invites_email_ci").on(sql`lower(email)`),
    uniqueIndex("idx_org_invites_token").on(table.token),
    foreignKey({
      columns: [table.invitedBy],
      foreignColumns: [users.userId],
      name: "org_invites_invited_by_fkey",
    }),
    foreignKey({
      columns: [table.orgId],
      foreignColumns: [orgs.orgId],
      name: "org_invites_org_id_fkey",
    }).onDelete("cascade"),
    unique("org_invites_invite_id_key").on(table.inviteId),
    unique("org_invites_token_key").on(table.token),
  ],
)

/**
 * Email invites - Beta/waitlist invitations
 */
export const emailInvites = iamSchema.table(
  "email_invites",
  {
    emailInviteId: text("email_invite_id").default(sql`gen_prefixed_id('emi_'::text)`).primaryKey().notNull(),
    senderId: text("sender_id").notNull(),
    email: text("email").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  table => [
    index("idx_email_invites_sender_date").on(table.senderId, table.sentAt),
    foreignKey({
      columns: [table.senderId],
      foreignColumns: [users.userId],
      name: "email_invites_sender_id_fkey",
    }).onDelete("cascade"),
    unique("email_invites_sender_id_email_key").on(table.senderId, table.email),
  ],
)

/**
 * Referrals - User referral tracking
 */
export const referrals = iamSchema.table(
  "referrals",
  {
    referralId: text("referral_id").default(sql`gen_prefixed_id('ref_'::text)`).primaryKey().notNull(),
    referrerId: text("referrer_id").notNull(),
    referredId: text("referred_id").notNull(),
    creditsAwarded: numeric("credits_awarded").default("500").notNull(),
    status: text("status").default("pending").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
  },
  table => [
    index("idx_referrals_referrer").on(table.referrerId),
    index("idx_referrals_status").on(table.status),
    foreignKey({
      columns: [table.referredId],
      foreignColumns: [users.userId],
      name: "referrals_referred_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.referrerId],
      foreignColumns: [users.userId],
      name: "referrals_referrer_id_fkey",
    }).onDelete("cascade"),
    unique("referrals_referred_id_key").on(table.referredId),
    check("referrals_status_check", sql`status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text])`),
  ],
)

// ============================================================================
// RELATIONS
// ============================================================================

export const usersRelations = relations(users, ({ many, one }) => ({
  orgMemberships: many(orgMemberships),
  sessions: many(sessions),
  preferences: one(userPreferences, {
    fields: [users.userId],
    references: [userPreferences.userId],
  }),
  sentInvites: many(emailInvites),
  referralsGiven: many(referrals, { relationName: "referrer" }),
  referralsReceived: many(referrals, { relationName: "referred" }),
}))

export const orgsRelations = relations(orgs, ({ many }) => ({
  memberships: many(orgMemberships),
  invites: many(orgInvites),
}))

export const orgMembershipsRelations = relations(orgMemberships, ({ one }) => ({
  user: one(users, {
    fields: [orgMemberships.userId],
    references: [users.userId],
  }),
  org: one(orgs, {
    fields: [orgMemberships.orgId],
    references: [orgs.orgId],
  }),
}))

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.userId],
  }),
}))

export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
  user: one(users, {
    fields: [userPreferences.userId],
    references: [users.userId],
  }),
  selectedOrg: one(orgs, {
    fields: [userPreferences.selectedOrgId],
    references: [orgs.orgId],
  }),
}))

export const orgInvitesRelations = relations(orgInvites, ({ one }) => ({
  org: one(orgs, {
    fields: [orgInvites.orgId],
    references: [orgs.orgId],
  }),
  invitedByUser: one(users, {
    fields: [orgInvites.invitedBy],
    references: [users.userId],
  }),
}))

export const emailInvitesRelations = relations(emailInvites, ({ one }) => ({
  sender: one(users, {
    fields: [emailInvites.senderId],
    references: [users.userId],
  }),
}))

export const referralsRelations = relations(referrals, ({ one }) => ({
  referrer: one(users, {
    fields: [referrals.referrerId],
    references: [users.userId],
    relationName: "referrer",
  }),
  referred: one(users, {
    fields: [referrals.referredId],
    references: [users.userId],
    relationName: "referred",
  }),
}))
