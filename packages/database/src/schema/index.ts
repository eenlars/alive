/**
 * Database Schema Index
 *
 * Exports all Drizzle schema definitions for Alive.
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
// App Schema - Application Data
// ============================================================================
export {
  // Schema
  appSchema,
  // Enums
  automationActionTypeEnum,
  automationJobs,
  automationJobsRelations,
  automationRunStatusEnum,
  automationRuns,
  automationRunsRelations,
  automationTriggerTypeEnum,
  conversations,
  conversationsRelations,
  conversationTabs,
  conversationTabsRelations,
  domains,
  // Relations
  domainsRelations,
  errors,
  feedback,
  gatewaySettings,
  messages,
  messagesRelations,
  // Tables
  servers,
  severityLevelEnum,
  templates,
  userOnboarding,
  userOnboardingRelations,
  userProfile,
  userQuotas,
  userQuotasRelations,
} from "./app"
// ============================================================================
// IAM Schema - Identity & Access Management
// ============================================================================
export {
  emailInvites,
  emailInvitesRelations,
  // Schema
  iamSchema,
  orgInvites,
  orgInvitesRelations,
  orgMemberships,
  orgMembershipsRelations,
  // Enums
  orgRoleEnum,
  orgs,
  orgsRelations,
  referrals,
  referralsRelations,
  sessions,
  sessionsRelations,
  userPreferences,
  userPreferencesRelations,
  userStatusEnum,
  // Tables
  users,
  // Relations
  usersRelations,
} from "./iam"

// ============================================================================
// Integrations Schema - OAuth & External Services
// ============================================================================
export {
  accessPolicies,
  accessPoliciesRelations,
  // Schema
  integrationsSchema,
  // Tables
  providers,
  // Relations
  providersRelations,
} from "./integrations"

// ============================================================================
// Lockbox Schema - Encrypted Secrets
// ============================================================================
export {
  // Schema
  lockboxSchema,
  secretKeys,
  secretKeysRelations,
  // Tables
  userSecrets,
  // Relations
  userSecretsRelations,
} from "./lockbox"
