/**
 * Database Schema Index
 *
 * Exports all Drizzle schema definitions for Claude Bridge.
 *
 * Schemas:
 * - iam: Identity and access management (users, orgs, sessions)
 * - app: Application data (domains, conversations, automations)
 * - integrations: OAuth providers and access policies
 * - lockbox: Encrypted secrets storage
 *
 * Usage:
 * ```typescript
 * import * as schema from '@webalive/database/schema'
 * import { drizzle } from 'drizzle-orm/node-postgres'
 *
 * const db = drizzle(pool, { schema })
 * ```
 */

// ============================================================================
// IAM Schema - Identity & Access Management
// ============================================================================
export {
  // Schema
  iamSchema,
  // Enums
  orgRoleEnum,
  userStatusEnum,
  // Tables
  users,
  orgs,
  orgMemberships,
  sessions,
  userPreferences,
  orgInvites,
  emailInvites,
  referrals,
  // Relations
  usersRelations,
  orgsRelations,
  orgMembershipsRelations,
  sessionsRelations,
  userPreferencesRelations,
  orgInvitesRelations,
  emailInvitesRelations,
  referralsRelations,
} from "./iam"

// ============================================================================
// App Schema - Application Data
// ============================================================================
export {
  // Schema
  appSchema,
  // Enums
  automationActionTypeEnum,
  automationRunStatusEnum,
  automationTriggerTypeEnum,
  severityLevelEnum,
  // Tables
  servers,
  domains,
  templates,
  conversations,
  conversationTabs,
  messages,
  automationJobs,
  automationRuns,
  userQuotas,
  userOnboarding,
  userProfile,
  gatewaySettings,
  feedback,
  errors,
  // Relations
  domainsRelations,
  conversationsRelations,
  conversationTabsRelations,
  messagesRelations,
  automationJobsRelations,
  automationRunsRelations,
  userQuotasRelations,
  userOnboardingRelations,
} from "./app"

// ============================================================================
// Integrations Schema - OAuth & External Services
// ============================================================================
export {
  // Schema
  integrationsSchema,
  // Tables
  providers,
  accessPolicies,
  // Relations
  providersRelations,
  accessPoliciesRelations,
} from "./integrations"

// ============================================================================
// Lockbox Schema - Encrypted Secrets
// ============================================================================
export {
  // Schema
  lockboxSchema,
  // Tables
  userSecrets,
  secretKeys,
  // Relations
  userSecretsRelations,
  secretKeysRelations,
} from "./lockbox"
