/**
 * App Schema - Application Data
 *
 * Tables for domains, conversations, messages, automations, templates, etc.
 * This is the main application data layer.
 *
 * Note: All IDs are TEXT with gen_prefixed_id() defaults (e.g., dom_xxx, auto_job_xxx)
 * This matches the production Supabase database.
 */
import { relations, sql } from "drizzle-orm"
import {
  bigserial,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core"

// Import IAM schema for foreign keys
import { users, orgs } from "./iam"

// Define the App schema
export const appSchema = pgSchema("app")

// ============================================================================
// ENUMS (in app schema)
// ============================================================================

export const automationActionTypeEnum = appSchema.enum("automation_action_type", ["prompt", "sync", "publish"])

export const automationRunStatusEnum = appSchema.enum("automation_run_status", [
  "pending",
  "running",
  "success",
  "failure",
  "skipped",
])

export const automationTriggerTypeEnum = appSchema.enum("automation_trigger_type", ["cron", "webhook", "one-time"])

export const severityLevelEnum = appSchema.enum("severity_level", ["info", "warn", "error", "debug", "fatal"])

// ============================================================================
// TABLES
// ============================================================================

/**
 * Servers - Physical/virtual servers hosting sites
 */
export const servers = appSchema.table("servers", {
  serverId: text("server_id").primaryKey().notNull(),
  name: text("name").notNull(),
  ip: text("ip").notNull(),
  hostname: text("hostname"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
})

/**
 * Domains - Deployed websites/workspaces
 * domain_id is TEXT with gen_prefixed_id('dom_') default
 */
export const domains = appSchema.table(
  "domains",
  {
    domainId: text("domain_id").default(sql`gen_prefixed_id('dom_'::text)`).primaryKey().notNull(),
    hostname: text("hostname").notNull(),
    port: integer("port").notNull(),
    orgId: text("org_id"),
    serverId: text("server_id"),
    isTestEnv: boolean("is_test_env").default(false),
    testRunId: text("test_run_id"), // For E2E test isolation
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  table => [
    index("domains_server_id_idx").on(table.serverId),
    uniqueIndex("idx_domains_hostname_ci").on(sql`lower(hostname)`),
    index("idx_domains_is_test_env").on(table.isTestEnv),
    index("idx_domains_org").on(table.orgId),
    index("idx_domains_test_run_id").on(table.testRunId),
    foreignKey({
      columns: [table.orgId],
      foreignColumns: [orgs.orgId],
      name: "domains_org_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.serverId],
      foreignColumns: [servers.serverId],
      name: "domains_server_id_fkey",
    }),
    unique("workspaces_hostname_key").on(table.hostname),
  ],
)

/**
 * Templates - Site templates for deployment
 */
export const templates = appSchema.table("templates", {
  templateId: text("template_id").default(sql`gen_prefixed_id('tmpl_'::text)`).primaryKey().notNull(),
  name: text("name").notNull(),
  description: text("description"),
  aiDescription: text("ai_description"), // Description for AI selection
  sourcePath: text("source_path").notNull(), // Path to template files
  previewUrl: text("preview_url"),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").default(true),
  deployCount: integer("deploy_count").default(0),
})

/**
 * Conversations - Chat conversation containers
 */
export const conversations = appSchema.table(
  "conversations",
  {
    conversationId: text("conversation_id").default(sql`gen_random_uuid()::text`).primaryKey().notNull(),
    userId: text("user_id").notNull(),
    orgId: text("org_id").notNull(),
    workspace: text("workspace").notNull(),
    title: text("title").default("New conversation").notNull(),
    visibility: text("visibility").default("private").notNull(),
    messageCount: integer("message_count").default(0).notNull(),
    firstUserMessageId: text("first_user_message_id"),
    autoTitleSet: boolean("auto_title_set").default(false).notNull(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true, mode: "string" }),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "string" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  table => [
    index("idx_conversations_org_shared")
      .on(table.orgId, table.visibility, table.updatedAt)
      .where(sql`((deleted_at IS NULL) AND (visibility = 'shared'::text))`),
    index("idx_conversations_user_updated").on(table.userId, table.updatedAt).where(sql`(deleted_at IS NULL)`),
    index("idx_conversations_user_workspace")
      .on(table.userId, table.workspace, table.updatedAt)
      .where(sql`(deleted_at IS NULL)`),
    foreignKey({
      columns: [table.orgId],
      foreignColumns: [orgs.orgId],
      name: "conversations_org_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.userId],
      name: "conversations_user_id_fkey",
    }).onDelete("cascade"),
    check("conversations_visibility_check", sql`visibility = ANY (ARRAY['private'::text, 'shared'::text])`),
  ],
)

/**
 * Conversation tabs - Multiple tabs within a conversation
 */
export const conversationTabs = appSchema.table(
  "conversation_tabs",
  {
    tabId: text("tab_id").default(sql`gen_random_uuid()::text`).primaryKey().notNull(),
    conversationId: text("conversation_id").notNull(),
    name: text("name").notNull(),
    position: integer("position").default(0).notNull(),
    messageCount: integer("message_count").default(0).notNull(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true, mode: "string" }),
    closedAt: timestamp("closed_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  table => [
    index("idx_conversation_tabs_conversation")
      .on(table.conversationId, table.position)
      .where(sql`(closed_at IS NULL)`),
    foreignKey({
      columns: [table.conversationId],
      foreignColumns: [conversations.conversationId],
      name: "conversation_tabs_conversation_id_fkey",
    }).onDelete("cascade"),
  ],
)

/**
 * Messages - Individual chat messages
 */
export const messages = appSchema.table(
  "messages",
  {
    messageId: text("message_id").default(sql`gen_random_uuid()::text`).primaryKey().notNull(),
    tabId: text("tab_id").notNull(),
    seq: integer("seq").notNull(), // Sequence number within tab
    type: text("type").notNull(), // 'user', 'assistant', 'system', 'tool_use', 'tool_result', 'thinking', 'sdk_message'
    content: jsonb("content").notNull(), // Message content blocks
    status: text("status").default("complete").notNull(), // 'streaming', 'complete', 'interrupted', 'error'
    errorCode: text("error_code"),
    abortedAt: timestamp("aborted_at", { withTimezone: true, mode: "string" }),
    version: integer("version").default(1).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  table => [
    index("idx_messages_tab_created").on(table.tabId, table.createdAt),
    index("idx_messages_tab_seq").on(table.tabId, table.seq),
    foreignKey({
      columns: [table.tabId],
      foreignColumns: [conversationTabs.tabId],
      name: "messages_tab_id_fkey",
    }).onDelete("cascade"),
    unique("messages_tab_id_seq_key").on(table.tabId, table.seq),
    check(
      "messages_status_check",
      sql`status = ANY (ARRAY['streaming'::text, 'complete'::text, 'interrupted'::text, 'error'::text])`,
    ),
    check(
      "messages_type_check",
      sql`type = ANY (ARRAY['user'::text, 'assistant'::text, 'tool_use'::text, 'tool_result'::text, 'thinking'::text, 'system'::text, 'sdk_message'::text])`,
    ),
  ],
)

/**
 * Automation jobs - Scheduled/triggered automation tasks
 */
export const automationJobs = appSchema.table(
  "automation_jobs",
  {
    id: text("id").default(sql`gen_prefixed_id('auto_job_'::text)`).primaryKey().notNull(),
    siteId: text("site_id").notNull(),
    userId: text("user_id").notNull(),
    orgId: text("org_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    triggerType: automationTriggerTypeEnum("trigger_type").notNull(),
    actionType: automationActionTypeEnum("action_type").notNull(),

    // Cron settings
    cronSchedule: text("cron_schedule"),
    cronTimezone: text("cron_timezone"),
    runAt: timestamp("run_at", { withTimezone: true, mode: "string" }), // For one-time runs

    // Action settings
    actionPrompt: text("action_prompt"),
    actionModel: text("action_model"),
    actionFormatPrompt: text("action_format_prompt"),
    actionSource: jsonb("action_source"),
    actionTargetPage: text("action_target_page"),
    actionTimeoutSeconds: integer("action_timeout_seconds").default(300),
    skills: text("skills").array().default([]),

    // Webhook settings
    webhookSecret: text("webhook_secret"),

    // State
    isActive: boolean("is_active").default(true).notNull(),
    deleteAfterRun: boolean("delete_after_run").default(false),
    runningAt: timestamp("running_at", { withTimezone: true, mode: "string" }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true, mode: "string" }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true, mode: "string" }),
    lastRunStatus: automationRunStatusEnum("last_run_status"),
    lastRunError: text("last_run_error"),
    lastRunDurationMs: integer("last_run_duration_ms"),
    consecutiveFailures: integer("consecutive_failures").default(0),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  table => [
    index("idx_automation_jobs_is_active").on(table.isActive),
    index("idx_automation_jobs_next_run")
      .on(table.nextRunAt)
      .where(sql`((is_active = true) AND (next_run_at IS NOT NULL))`),
    index("idx_automation_jobs_org_id").on(table.orgId),
    index("idx_automation_jobs_site_id").on(table.siteId),
    index("idx_automation_jobs_trigger_type").on(table.triggerType),
    index("idx_automation_jobs_user_id").on(table.userId),
    foreignKey({
      columns: [table.orgId],
      foreignColumns: [orgs.orgId],
      name: "automation_jobs_org_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.siteId],
      foreignColumns: [domains.domainId],
      name: "automation_jobs_site_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.userId],
      name: "automation_jobs_user_id_fkey",
    }).onDelete("cascade"),
    check(
      "chk_cron_schedule",
      sql`(trigger_type <> 'cron'::app.automation_trigger_type) OR (cron_schedule IS NOT NULL)`,
    ),
    check(
      "chk_one_time_run_at",
      sql`(trigger_type <> 'one-time'::app.automation_trigger_type) OR (run_at IS NOT NULL)`,
    ),
    check(
      "chk_prompt_action",
      sql`(action_type <> 'prompt'::app.automation_action_type) OR (action_prompt IS NOT NULL)`,
    ),
  ],
)

/**
 * Automation runs - Individual execution records
 */
export const automationRuns = appSchema.table(
  "automation_runs",
  {
    id: text("id").default(sql`gen_prefixed_id('auto_run_'::text)`).primaryKey().notNull(),
    jobId: text("job_id").notNull(),
    status: automationRunStatusEnum("status").default("pending").notNull(),
    triggeredBy: text("triggered_by"), // 'cron', 'webhook', 'manual'
    triggerContext: jsonb("trigger_context"),
    result: jsonb("result"),
    messages: jsonb("messages"), // Conversation messages during run
    changesMade: text("changes_made").array(),
    error: text("error"),
    durationMs: integer("duration_ms"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
  },
  table => [
    index("idx_automation_runs_job_id").on(table.jobId),
    index("idx_automation_runs_started_at").on(table.startedAt),
    index("idx_automation_runs_status").on(table.status),
    foreignKey({
      columns: [table.jobId],
      foreignColumns: [automationJobs.id],
      name: "automation_runs_job_id_fkey",
    }).onDelete("cascade"),
  ],
)

/**
 * User quotas - Resource limits per user
 */
export const userQuotas = appSchema.table(
  "user_quotas",
  {
    userId: text("user_id").primaryKey().notNull(),
    maxSites: integer("max_sites").default(2).notNull(),
    maxStorageMb: integer("max_storage_mb").default(500),
    maxMonthlyBuilds: integer("max_monthly_builds").default(100),
    maxCustomDomains: integer("max_custom_domains").default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  table => [
    index("idx_user_quotas_user_id").on(table.userId),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.userId],
      name: "user_quotas_user_id_fkey",
    }),
  ],
)

/**
 * User onboarding - Onboarding questionnaire data
 */
export const userOnboarding = appSchema.table(
  "user_onboarding",
  {
    userId: text("user_id").primaryKey().notNull(),
    orgId: text("org_id"),
    status: text("status").default("in_progress").notNull(),
    experience: text("experience").default("new").notNull(),
    role: text("role"),
    industry: text("industry"),
    primaryGoal: text("primary_goal"),
    successMetric: text("success_metric"),
    teamSize: integer("team_size"),
    timeBudgetMinPerWeek: integer("time_budget_min_per_week"),
    autonomy: text("autonomy").default("review").notNull(),
    approvalRules: jsonb("approval_rules").default({}).notNull(),
    topTasks: text("top_tasks").array().default([]).notNull(),
    preferredApps: text("preferred_apps").array().default([]).notNull(),
    dataSources: text("data_sources").array().default([]).notNull(),
    notifyChannels: text("notify_channels").array().default(["inapp"]).notNull(),
    timezone: text("timezone").default("UTC"),
    locale: text("locale").default("en-US"),
    ipAddress: text("ip_address"),
    marketingOptIn: boolean("marketing_opt_in").default(false).notNull(),
    tosAcceptedAt: timestamp("tos_accepted_at", { withTimezone: true, mode: "string" }),
    privacyAcceptedAt: timestamp("privacy_accepted_at", { withTimezone: true, mode: "string" }),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  table => [
    foreignKey({
      columns: [table.orgId],
      foreignColumns: [orgs.orgId],
      name: "user_onboarding_org_id_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.userId],
      name: "user_onboarding_user_id_fkey",
    }).onDelete("cascade"),
    check("user_onboarding_autonomy_check", sql`autonomy = ANY (ARRAY['manual'::text, 'review'::text, 'auto'::text])`),
    check(
      "user_onboarding_experience_check",
      sql`experience = ANY (ARRAY['new'::text, 'intermediate'::text, 'power'::text])`,
    ),
    check(
      "user_onboarding_status_check",
      sql`status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'completed'::text, 'skipped'::text])`,
    ),
    check("user_onboarding_team_size_check", sql`(team_size IS NULL) OR (team_size >= 1)`),
    check(
      "user_onboarding_time_budget_min_per_week_check",
      sql`(time_budget_min_per_week IS NULL) OR (time_budget_min_per_week >= 0)`,
    ),
  ],
)

/**
 * User profile - Extended user information
 */
export const userProfile = appSchema.table(
  "user_profile",
  {
    userProfileId: text("user_profile_id").default(sql`gen_prefixed_id('usr_pr'::text)`).primaryKey().notNull(),
    clerkId: text("clerk_id").notNull(), // References user_id
    about: text("about"),
    goals: text("goals"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  table => [unique("user_profile_clerk_id_key").on(table.clerkId)],
)

/**
 * Gateway settings - AI model gateway configurations
 */
export const gatewaySettings = appSchema.table(
  "gateway_settings",
  {
    gatewaySettingId: text("gateway_setting_id").default(sql`gen_prefixed_id('gw_'::text)`).primaryKey().notNull(),
    clerkId: text("clerk_id").notNull(), // References user_id
    gateway: text("gateway").notNull(), // 'openai-api', 'openrouter-api', 'groq-api', 'anthropic-api'
    isEnabled: boolean("is_enabled").default(true).notNull(),
    enabledModels: jsonb("enabled_models").default([]).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  table => [
    index("idx_gateway_settings_clerk").on(table.clerkId),
    foreignKey({
      columns: [table.clerkId],
      foreignColumns: [users.userId],
      name: "gateway_settings_clerk_id_fkey",
    }).onDelete("cascade"),
    unique("gateway_settings_clerk_id_gateway_key").on(table.clerkId, table.gateway),
    check(
      "gateway_settings_gateway_check",
      sql`gateway = ANY (ARRAY['openai-api'::text, 'openrouter-api'::text, 'groq-api'::text, 'anthropic-api'::text])`,
    ),
  ],
)

/**
 * Feedback - User feedback submissions
 */
export const feedback = appSchema.table("feedback", {
  feedbackId: text("feedback_id").default(sql`gen_prefixed_id('fbk_'::text)`).primaryKey().notNull(),
  userId: text("user_id").default(sql`sub()`),
  content: text("content").notNull(),
  context: jsonb("context"), // Page, conversation, etc.
  status: text("status").default("new"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow(),
})

/**
 * Errors - Error tracking and aggregation
 */
export const errors = appSchema.table(
  "errors",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey().notNull(),
    hash: text("hash").notNull(), // Unique error signature
    message: text("message").notNull(),
    stack: text("stack"),
    location: text("location").notNull(),
    env: text("env").notNull(), // 'development', 'production'
    severity: severityLevelEnum("severity").default("error").notNull(),
    clerkId: text("clerk_id"),
    error: jsonb("error"),
    totalCount: integer("total_count").default(1).notNull(),
    lastSeen: timestamp("last_seen", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  table => [
    index("errors_env_last_seen_idx").on(table.env, table.lastSeen),
    uniqueIndex("errors_hash_uidx").on(table.hash),
    check("errors_env_check", sql`env = ANY (ARRAY['production'::text, 'development'::text])`),
  ],
)

// ============================================================================
// RELATIONS
// ============================================================================

export const domainsRelations = relations(domains, ({ one, many }) => ({
  server: one(servers, {
    fields: [domains.serverId],
    references: [servers.serverId],
  }),
  org: one(orgs, {
    fields: [domains.orgId],
    references: [orgs.orgId],
  }),
  automationJobs: many(automationJobs),
}))

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  user: one(users, {
    fields: [conversations.userId],
    references: [users.userId],
  }),
  org: one(orgs, {
    fields: [conversations.orgId],
    references: [orgs.orgId],
  }),
  tabs: many(conversationTabs),
}))

export const conversationTabsRelations = relations(conversationTabs, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [conversationTabs.conversationId],
    references: [conversations.conversationId],
  }),
  messages: many(messages),
}))

export const messagesRelations = relations(messages, ({ one }) => ({
  tab: one(conversationTabs, {
    fields: [messages.tabId],
    references: [conversationTabs.tabId],
  }),
}))

export const automationJobsRelations = relations(automationJobs, ({ one, many }) => ({
  site: one(domains, {
    fields: [automationJobs.siteId],
    references: [domains.domainId],
  }),
  user: one(users, {
    fields: [automationJobs.userId],
    references: [users.userId],
  }),
  org: one(orgs, {
    fields: [automationJobs.orgId],
    references: [orgs.orgId],
  }),
  runs: many(automationRuns),
}))

export const automationRunsRelations = relations(automationRuns, ({ one }) => ({
  job: one(automationJobs, {
    fields: [automationRuns.jobId],
    references: [automationJobs.id],
  }),
}))

export const userQuotasRelations = relations(userQuotas, ({ one }) => ({
  user: one(users, {
    fields: [userQuotas.userId],
    references: [users.userId],
  }),
}))

export const userOnboardingRelations = relations(userOnboarding, ({ one }) => ({
  user: one(users, {
    fields: [userOnboarding.userId],
    references: [users.userId],
  }),
  org: one(orgs, {
    fields: [userOnboarding.orgId],
    references: [orgs.orgId],
  }),
}))
