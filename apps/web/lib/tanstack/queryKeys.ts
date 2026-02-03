/**
 * Query Key Factory Pattern
 * Centralizes all query keys to prevent typos and enable bulk invalidation
 *
 * Structure: [namespace, identifier, filters]
 * Benefits:
 * - Type-safe query keys
 * - Bulk invalidation: invalidate(['user']) clears all user queries
 * - Easy maintenance: change key in one place
 */

export const queryKeys = {
  // User queries
  user: {
    all: ["user"] as const,
    detail: () => [...queryKeys.user.all, "detail"] as const,
    settings: () => [...queryKeys.user.all, "settings"] as const,
  },

  // Organization queries
  organizations: {
    all: ["organizations"] as const,
    list: () => [...queryKeys.organizations.all, "list"] as const,
    detail: (orgId: string) => [...queryKeys.organizations.all, "detail", orgId] as const,
  },

  // Workspace queries
  workspaces: {
    all: ["workspaces"] as const,
    list: () => [...queryKeys.workspaces.all, "list"] as const,
    forOrg: (orgId: string) => [...queryKeys.workspaces.all, "org", orgId] as const,
    allForUser: () => [...queryKeys.workspaces.all, "all"] as const,
    detail: (workspaceId: string) => [...queryKeys.workspaces.all, "detail", workspaceId] as const,
    members: (workspaceId: string) => [...queryKeys.workspaces.detail(workspaceId), "members"] as const,
    settings: (workspaceId: string) => [...queryKeys.workspaces.detail(workspaceId), "settings"] as const,
  },

  // Organization members
  orgMembers: {
    all: ["org-members"] as const,
    forOrg: (orgId: string) => [...queryKeys.orgMembers.all, orgId] as const,
  },

  // Integration queries
  integrations: {
    all: ["integrations"] as const,
    list: () => [...queryKeys.integrations.all, "list"] as const,
    detail: (integrationId: string) => [...queryKeys.integrations.all, integrationId] as const,
  },

  // Feature flags
  flags: {
    all: ["flags"] as const,
    user: () => [...queryKeys.flags.all, "user"] as const,
    admin: () => [...queryKeys.flags.all, "admin"] as const,
  },

  // API keys
  apiKeys: {
    all: ["api-keys"] as const,
    list: () => [...queryKeys.apiKeys.all, "list"] as const,
  },

  // Automation queries
  automations: {
    all: ["automations"] as const,
    list: () => [...queryKeys.automations.all, "list"] as const,
    detail: (automationId: string) => [...queryKeys.automations.all, automationId] as const,
    runs: (automationId: string) => [...queryKeys.automations.all, automationId, "runs"] as const,
  },

  // Template queries
  templates: {
    all: ["templates"] as const,
    list: () => [...queryKeys.templates.all, "list"] as const,
    detail: (templateId: string) => [...queryKeys.templates.all, templateId] as const,
  },

  // User environment keys
  envKeys: {
    all: ["env-keys"] as const,
    list: () => [...queryKeys.envKeys.all, "list"] as const,
  },

  // Sites (for automations, etc.)
  sites: {
    all: ["sites"] as const,
    list: () => [...queryKeys.sites.all, "list"] as const,
  },
} as const

/**
 * Usage examples:
 *
 * // Query definition
 * useQuery({
 *   queryKey: queryKeys.user.detail(),
 *   queryFn: fetchUser,
 * })
 *
 * // Invalidate all user queries
 * queryClient.invalidateQueries({ queryKey: queryKeys.user.all })
 *
 * // Invalidate specific user
 * queryClient.invalidateQueries({ queryKey: queryKeys.user.detail() })
 *
 * // Invalidate all org queries
 * queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all })
 */
