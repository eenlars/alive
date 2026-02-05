import { z } from "zod"
import { RESERVED_SLUGS } from "@/features/deployment/types/guards"
import { OptionalWorktreeSchema, OptionalWorktreeSlugSchema } from "@/types/guards/worktree-schemas"

// ============================================================================
// STANDARDIZED RESPONSE ENVELOPES
// ============================================================================

/**
 * Generic success envelope { success: true, data: T }
 */
export const SuccessResponse = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
  })

/**
 * Generic error envelope { success: false, error: {...} }
 */
export const ErrorResponse = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    timestamp: z.string().datetime().optional(),
  }),
})

/**
 * Union of success or error (common pattern in APIs)
 */
export const ApiResponse = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.union([SuccessResponse(dataSchema), ErrorResponse])

// ============================================================================
// CLAUDE BRIDGE API SCHEMAS
// ============================================================================

/**
 * Centralized API schema registry for type-safe request/response handling
 *
 * Usage in route handlers:
 *   const parsed = await handleBody('login', req)
 *   return alrighty('login', { userId: '123' })
 *
 * Usage in client code:
 *   const data = await postty('login', { email, password })
 */
export const apiSchemas = {
  /**
   * POST /api/login
   * User authentication
   */
  login: {
    req: z
      .object({
        email: z.string().email(),
        password: z.string().min(1),
      })
      .brand<"LoginRequest">(),
    res: z.object({
      ok: z.boolean(),
      userId: z.string().optional(),
      error: z.string().optional(),
      message: z.string().optional(),
      requestId: z.string().optional(),
      details: z.unknown().optional(),
    }),
  },

  /**
   * GET /api/user
   * Get current authenticated user
   * Returns full SessionUser object from getSessionUser()
   */
  user: {
    req: z.undefined().brand<"UserRequest">(), // GET has no body
    res: z.object({
      user: z
        .object({
          id: z.string(),
          email: z.string().email(),
          name: z.string().nullable(),
          canSelectAnyModel: z.boolean(),
          isAdmin: z.boolean(),
          isSuperadmin: z.boolean(),
        })
        .nullable(),
    }),
  },

  /**
   * POST /api/feedback
   * Submit user feedback
   */
  feedback: {
    req: z
      .object({
        feedback: z.string().min(1).max(5000),
        email: z.string().email().optional(),
        workspace: z.string().optional(),
        conversationId: z.string().uuid().optional(),
        userAgent: z.string().optional(),
      })
      .brand<"FeedbackRequest">(),
    res: z.object({
      ok: z.boolean(),
      id: z.string().optional(),
      timestamp: z.string().optional(),
      error: z.string().optional(),
      message: z.string().optional(),
    }),
  },

  /**
   * POST /api/claude/stream/cancel
   * Cancel an active stream
   *
   * Two modes:
   * - Primary: Cancel by requestId (when X-Request-Id header was received)
   * - Fallback: Cancel by tabId + workspace (super-early Stop)
   *
   * Note: Schema is permissive - server does its own validation.
   * Either requestId OR (tabId + workspace) must be provided.
   */
  "claude/stream/cancel": {
    req: z
      .object({
        requestId: z.string().optional(),
        tabGroupId: z.string().optional(), // Tab group ID for lock key
        tabId: z.string().optional(), // Primary session key (replaces conversationId for fallback)
        workspace: z.string().optional(),
        worktree: OptionalWorktreeSchema, // Validated to prevent session key corruption
        clientStack: z.string().optional(), // Debug: client-side stack trace for tracking cancel origin
      })
      .refine(data => data.requestId || (data.tabGroupId && data.tabId && data.workspace), {
        message: "Either requestId or (tabGroupId + tabId + workspace) must be provided",
      })
      .brand<"CancelStreamRequest">(),
    res: z.object({
      ok: z.boolean(),
      status: z.enum(["cancelled", "already_complete"]),
      requestId: z.string().optional(),
      tabId: z.string().optional(),
    }),
  },
  /**
   * GET /api/manager/templates
   * Get all templates (manager auth required)
   */
  "manager/templates": {
    req: z.undefined().brand<"ManagerTemplatesGetRequest">(),
    res: z.object({
      ok: z.boolean(),
      templates: z.array(
        z.object({
          template_id: z.string(),
          name: z.string(),
          description: z.string().nullable(),
          ai_description: z.string().nullable(),
          source_path: z.string(),
          preview_url: z.string().nullable(),
          image_url: z.string().nullable(),
          is_active: z.boolean().nullable(),
          deploy_count: z.number().nullable(),
        }),
      ),
      count: z.number(),
    }),
  },

  /**
   * POST /api/manager/templates
   * Create a new template (manager auth required)
   */
  "manager/templates/create": {
    req: z
      .object({
        template_id: z.string().optional(),
        name: z.string().min(1),
        description: z.string().nullable().optional(),
        ai_description: z.string().nullable().optional(),
        source_path: z.string().min(1),
        preview_url: z.string().nullable().optional(),
        image_url: z.string().nullable().optional(),
        is_active: z.boolean().optional(),
      })
      .brand<"ManagerTemplatesCreateRequest">(),
    res: z.object({
      ok: z.boolean(),
      template: z.object({
        template_id: z.string(),
        name: z.string(),
        description: z.string().nullable(),
        ai_description: z.string().nullable(),
        source_path: z.string(),
        preview_url: z.string().nullable(),
        image_url: z.string().nullable(),
        is_active: z.boolean().nullable(),
        deploy_count: z.number().nullable(),
      }),
    }),
  },

  /**
   * PUT /api/manager/templates
   * Update an existing template (manager auth required)
   */
  "manager/templates/update": {
    req: z
      .object({
        template_id: z.string(),
        name: z.string().optional(),
        description: z.string().nullable().optional(),
        ai_description: z.string().nullable().optional(),
        source_path: z.string().optional(),
        preview_url: z.string().nullable().optional(),
        image_url: z.string().nullable().optional(),
        is_active: z.boolean().optional(),
        deploy_count: z.number().optional(),
      })
      .brand<"ManagerTemplatesUpdateRequest">(),
    res: z.object({
      ok: z.boolean(),
      template: z.object({
        template_id: z.string(),
        name: z.string(),
        description: z.string().nullable(),
        ai_description: z.string().nullable(),
        source_path: z.string(),
        preview_url: z.string().nullable(),
        image_url: z.string().nullable(),
        is_active: z.boolean().nullable(),
        deploy_count: z.number().nullable(),
      }),
    }),
  },

  /**
   * DELETE /api/manager/templates?template_id=xxx
   * Delete a template (manager auth required)
   */
  "manager/templates/delete": {
    req: z.undefined().brand<"ManagerTemplatesDeleteRequest">(),
    res: z.object({
      ok: z.boolean(),
      deleted: z.boolean(),
      template_id: z.string(),
    }),
  },
  // ============================================================================
  // AUTH ENDPOINTS (used by TanStack Query)
  // ============================================================================

  /**
   * GET /api/auth/organizations
   * Get user's organizations with workspace counts
   */
  "auth/organizations": {
    req: z.undefined().brand<"AuthOrganizationsRequest">(),
    res: z.object({
      ok: z.literal(true),
      organizations: z.array(
        z.object({
          org_id: z.string(),
          name: z.string(),
          credits: z.number(),
          workspace_count: z.number(),
          role: z.enum(["owner", "admin", "member"]),
        }),
      ),
      current_user_id: z.string().optional(),
    }),
  },

  /**
   * GET /api/auth/all-workspaces
   * Get all workspaces for all orgs in one request
   */
  "auth/all-workspaces": {
    req: z.undefined().brand<"AuthAllWorkspacesRequest">(),
    res: z.object({
      ok: z.literal(true),
      workspaces: z.record(z.string(), z.array(z.string())),
    }),
  },

  /**
   * GET /api/auth/workspaces?org_id=xxx
   * Get workspaces for a specific org
   */
  "auth/workspaces": {
    req: z.undefined().brand<"AuthWorkspacesRequest">(),
    res: z.object({
      ok: z.literal(true),
      workspaces: z.array(z.string()),
    }),
  },

  /**
   * GET /api/auth/org-members?orgId=xxx
   * Get members of an organization
   */
  "auth/org-members": {
    req: z.undefined().brand<"AuthOrgMembersRequest">(),
    res: z.object({
      ok: z.literal(true),
      members: z.array(
        z.object({
          user_id: z.string(),
          email: z.string(),
          display_name: z.string().nullable(),
          role: z.enum(["owner", "admin", "member"]),
        }),
      ),
    }),
  },

  /**
   * DELETE /api/auth/organizations/{orgId}/members/{userId}
   * Remove member from organization
   * Note: Uses pathOverride for dynamic route
   */
  "auth/org-members/delete": {
    req: z.undefined().brand<"AuthOrgMembersDeleteRequest">(),
    res: z.object({
      ok: z.boolean(),
    }),
  },

  /**
   * PATCH /api/auth/organizations
   * Update organization details
   */
  "auth/organizations/update": {
    req: z
      .object({
        org_id: z.string(),
        name: z.string(),
      })
      .brand<"AuthOrganizationsUpdateRequest">(),
    res: z.object({
      ok: z.boolean(),
    }),
  },

  /**
   * PATCH /api/user
   * Update user profile
   */
  "user/update": {
    req: z
      .object({
        name: z.string().optional(),
        email: z.string().email().optional(),
      })
      .brand<"UserUpdateRequest">(),
    res: z.object({
      ok: z.boolean(),
    }),
  },

  /**
   * POST /api/deploy-subdomain
   * Create a new website deployment
   *
   * Supports both authenticated and anonymous users:
   * - Authenticated: email from session, password optional
   * - Anonymous: email and password required to create account
   */
  "deploy-subdomain": {
    req: z
      .object({
        slug: z
          .string()
          .min(3, "Slug must be at least 3 characters")
          .max(20, "Slug must be no more than 20 characters")
          .regex(/^[a-z0-9]([a-z0-9-]{1,18}[a-z0-9])?$/, "Slug must be lowercase letters, numbers, and hyphens only")
          .refine(slug => !RESERVED_SLUGS.some(r => r === slug), {
            message: "This slug is reserved and cannot be used. Please choose a different name.",
          }),
        email: z.string().email("Please enter a valid email address").optional(),
        password: z.string().optional(),
        orgId: z.string().min(1, "Organization ID cannot be empty").optional(),
        siteIdeas: z
          .string()
          .max(5000, "Site ideas must be less than 5000 characters")
          .transform(val => val || "")
          .optional()
          .default(""),
        templateId: z
          .string()
          .refine(val => val.startsWith("tmpl_"), {
            message: "Template ID must start with 'tmpl_'",
          })
          .optional(),
      })
      .brand<"DeploySubdomainRequest">(),
    res: z.object({
      ok: z.literal(true),
      message: z.string(),
      domain: z.string(),
      chatUrl: z.string(),
      orgId: z.string().optional(),
    }),
  },

  // ============================================================================
  // AUTOMATIONS & SITES (used by TanStack Query)
  // ============================================================================

  /**
   * GET /api/automations
   * List automation jobs
   */
  automations: {
    req: z.undefined().brand<"AutomationsRequest">(),
    res: z.object({
      ok: z.literal(true),
      automations: z.array(
        z.object({
          id: z.string(),
          site_id: z.string(),
          name: z.string(),
          description: z.string().nullable(),
          trigger_type: z.enum(["cron", "webhook", "one-time"]),
          cron_schedule: z.string().nullable(),
          cron_timezone: z.string().nullable(),
          run_at: z.string().nullable(),
          action_type: z.enum(["prompt", "sync", "publish"]),
          action_prompt: z.string().nullable(),
          action_source: z.string().nullable(),
          action_target_page: z.string().nullable(),
          skills: z.array(z.string()).nullable(),
          is_active: z.boolean(),
          last_run_at: z.string().nullable(),
          last_run_status: z.string().nullable(),
          next_run_at: z.string().nullable(),
          created_at: z.string(),
          hostname: z.string().optional(),
        }),
      ),
      total: z.number().optional(),
    }),
  },

  /**
   * POST /api/automations
   * Create a new automation job
   */
  "automations/create": {
    req: z.undefined().brand<"AutomationsCreateRequest">(), // Body validated in handler
    res: z.object({
      ok: z.literal(true),
      automation: z.object({
        id: z.string(),
        site_id: z.string(),
        name: z.string(),
        description: z.string().nullable(),
        trigger_type: z.enum(["cron", "webhook", "one-time"]),
        cron_schedule: z.string().nullable(),
        cron_timezone: z.string().nullable(),
        run_at: z.string().nullable(),
        action_type: z.enum(["prompt", "sync", "publish"]),
        action_prompt: z.string().nullable(),
        action_source: z.string().nullable(),
        action_target_page: z.string().nullable(),
        skills: z.array(z.string()).nullable(),
        is_active: z.boolean(),
        next_run_at: z.string().nullable(),
        created_at: z.string(),
      }),
    }),
  },

  /**
   * GET /api/sites
   * List sites for user's organizations
   */
  sites: {
    req: z.undefined().brand<"SitesRequest">(),
    res: z.object({
      ok: z.literal(true),
      sites: z.array(
        z.object({
          id: z.string(),
          hostname: z.string(),
          org_id: z.string(),
        }),
      ),
    }),
  },

  /**
   * GET /api/worktrees?workspace=<domain>
   * List worktrees for a workspace
   */
  worktrees: {
    req: z.undefined().brand<"WorktreesRequest">(),
    res: z.object({
      ok: z.literal(true),
      worktrees: z.array(
        z.object({
          slug: z.string(),
          pathRelative: z.string(),
          branch: z.string().nullable(),
          head: z.string().nullable(),
        }),
      ),
    }),
  },

  /**
   * POST /api/worktrees
   * Create a worktree
   */
  "worktrees/create": {
    req: z
      .object({
        workspace: z.string(),
        slug: OptionalWorktreeSlugSchema,
        branch: z.string().optional(),
        from: z.string().optional(),
      })
      .brand<"WorktreesCreateRequest">(),
    res: z.object({
      ok: z.literal(true),
      slug: z.string(),
      branch: z.string(),
      worktreePath: z.string(),
    }),
  },

  /**
   * DELETE /api/worktrees?workspace=<domain>&slug=<slug>
   * Remove a worktree
   */
  "worktrees/delete": {
    req: z.undefined().brand<"WorktreesDeleteRequest">(),
    res: z.object({
      ok: z.literal(true),
    }),
  },

  /**
   * GET /api/automations/[id]/runs
   * List runs for an automation job
   */
  "automations/runs": {
    req: z.undefined().brand<"AutomationsRunsRequest">(),
    res: z.object({
      runs: z.array(
        z.object({
          id: z.string(),
          job_id: z.string(),
          started_at: z.string(),
          completed_at: z.string().nullable(),
          duration_ms: z.number().nullable(),
          status: z.enum(["pending", "running", "success", "failure", "skipped"]),
          error: z.string().nullable(),
          triggered_by: z.string().nullable(),
          changes_made: z.array(z.string()).nullable(),
        }),
      ),
      job: z.object({
        id: z.string(),
        name: z.string(),
      }),
      pagination: z.object({
        limit: z.number(),
        offset: z.number(),
        total: z.number(),
      }),
    }),
  },

  // ============================================================================
  // INTEGRATIONS (used by TanStack Query)
  // ============================================================================

  /**
   * GET /api/integrations/available
   * Get available integrations for the current user
   */
  "integrations/available": {
    req: z.undefined().brand<"IntegrationsAvailableRequest">(),
    res: z.object({
      integrations: z.array(
        z.object({
          provider_key: z.string(),
          display_name: z.string(),
          logo_path: z.string().nullable(),
          is_connected: z.boolean(),
          visibility_status: z.string(),
          token_status: z.enum(["valid", "expired", "needs_reauth", "not_connected"]).optional(),
          status_message: z.string().optional(),
        }),
      ),
      user_id: z.string().optional(),
    }),
  },

  /**
   * DELETE /api/integrations/[provider]
   * Disconnect user from a provider
   * Uses pathOverride for dynamic provider path
   */
  "integrations/disconnect": {
    req: z.undefined().brand<"IntegrationsDisconnectRequest">(),
    res: z.object({
      ok: z.literal(true),
      message: z.string(),
    }),
  },

  /**
   * POST /api/integrations/[provider]
   * Connect user to a provider using a Personal Access Token (PAT)
   * Uses pathOverride for dynamic provider path
   */
  "integrations/connect": {
    req: z
      .object({
        token: z.string().min(1),
      })
      .brand<"IntegrationsConnectRequest">(),
    res: z.object({
      ok: z.literal(true),
      message: z.string(),
      username: z.string().optional(),
    }),
  },
} as const

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type Endpoint = keyof typeof apiSchemas
export type Req<E extends Endpoint> = z.infer<(typeof apiSchemas)[E]["req"]>
export type Res<E extends Endpoint> = z.infer<(typeof apiSchemas)[E]["res"]>

// ============================================================================
// VALIDATION HELPER
// ============================================================================

/**
 * Validates request data against the schema for the given endpoint.
 * Returns a branded type that can be passed to API functions.
 *
 * This is REQUIRED - you cannot pass raw objects to postty/putty.
 * The branded type ensures data has been validated.
 *
 * @example
 * ```typescript
 * // ❌ This won't compile:
 * await postty("login", { email: "test@example.com", password: "secret" })
 *
 * // ✅ This is required:
 * const validated = validateRequest("login", { email: "test@example.com", password: "secret" })
 * await postty("login", validated)
 * ```
 *
 * @throws {ZodError} If validation fails (invalid email, password too short, etc.)
 */
export function validateRequest<E extends Endpoint>(endpoint: E, data: unknown): Req<E> {
  const schema = apiSchemas[endpoint].req
  return schema.parse(data) as Req<E>
}
