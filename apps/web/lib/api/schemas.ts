import type { Req as PkgReq, Res as PkgRes } from "@alive-brug/alrighty"
import { CLAUDE_MODELS, ORG_ROLES } from "@webalive/shared"
import { z } from "zod"
import { RESERVED_SLUGS } from "@/features/deployment/types/guards"
import { OptionalWorktreeSchema, OptionalWorktreeSlugSchema } from "@/types/guards/worktree-schemas"

/** Zod schema for valid Claude model IDs, derived from the shared CLAUDE_MODELS constant */
const ClaudeModelSchema = z.enum(Object.values(CLAUDE_MODELS) as [string, ...string[]])

/**
 * Automation trigger types — single source of truth.
 *
 * Schedule triggers: "cron" (recurring) | "one-time" (run once at a specific time)
 * Event triggers:    "email" (incoming email) | "webhook" (HTTP call)
 *
 * A job is either schedule-based or event-based, never both.
 */
const SCHEDULE_TRIGGER_TYPES = ["cron", "one-time"] as const
const EVENT_TRIGGER_TYPES = ["email", "webhook"] as const
const ALL_TRIGGER_TYPES = [...SCHEDULE_TRIGGER_TYPES, ...EVENT_TRIGGER_TYPES] as const

export type TriggerType = (typeof ALL_TRIGGER_TYPES)[number]
export type ScheduleTriggerType = (typeof SCHEDULE_TRIGGER_TYPES)[number]
export type EventTriggerType = (typeof EVENT_TRIGGER_TYPES)[number]

const TriggerTypeSchema = z.enum(ALL_TRIGGER_TYPES)

export function isScheduleTrigger(t: TriggerType): t is ScheduleTriggerType {
  return (SCHEDULE_TRIGGER_TYPES as readonly string[]).includes(t)
}

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
          enabledModels: z.array(z.string()),
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
        worktree: OptionalWorktreeSchema.optional(), // Validated to prevent session key corruption
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
   * GET /api/templates
   * Get active templates for this server (public, no auth)
   */
  templates: {
    req: z.undefined().brand<"TemplatesRequest">(),
    res: z.object({
      templates: z.array(
        z.object({
          template_id: z.string(),
          name: z.string(),
          description: z.string().nullable(),
          ai_description: z.string().nullable(),
          preview_url: z.string().nullable(),
          image_url: z.string().nullable(),
          is_active: z.boolean().nullable(),
          deploy_count: z.number().nullable(),
        }),
      ),
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
  // MANAGER ENDPOINTS
  // ============================================================================

  /**
   * GET /api/manager/orgs
   * Get all organizations with members and domains (manager auth required)
   */
  "manager/orgs": {
    req: z.undefined().brand<"ManagerOrgsRequest">(),
    res: z.object({
      ok: z.literal(true),
      orgs: z.array(
        z.object({
          org_id: z.string(),
          name: z.string(),
          credits: z.number(),
          created_at: z.string(),
          updated_at: z.string().nullable().optional(),
          member_count: z.number(),
          domain_count: z.number(),
          members: z.array(
            z.object({
              user_id: z.string(),
              email: z.string(),
              display_name: z.string().nullable(),
              role: z.enum(ORG_ROLES),
              created_at: z.string().nullable(),
            }),
          ),
          domains: z.array(
            z.object({
              domain_id: z.string(),
              hostname: z.string(),
              port: z.number(),
              org_id: z.string().nullable(),
              server_id: z.string().nullable(),
              is_test_env: z.boolean(),
              test_run_id: z.string().nullable(),
              created_at: z.string(),
            }),
          ),
        }),
      ),
      feedback: z.array(z.record(z.string(), z.unknown())).optional(),
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
          role: z.enum(ORG_ROLES),
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
          role: z.enum(ORG_ROLES),
        }),
      ),
    }),
  },

  /**
   * POST /api/auth/org-members
   * Add a member to an organization by email
   */
  "auth/org-members/create": {
    req: z
      .object({
        orgId: z.string().min(1),
        email: z.string().trim().toLowerCase().email(),
        role: z.enum(["member", "admin"]).default("member"),
      })
      .brand<"AuthOrgMembersCreateRequest">(),
    res: z.object({
      ok: z.literal(true),
      member: z.object({
        user_id: z.string(),
        email: z.string(),
        display_name: z.string().nullable(),
        role: z.enum(ORG_ROLES),
      }),
    }),
  },

  /**
   * DELETE /api/auth/org-members
   * Remove a member from an organization
   */
  "auth/org-members/delete": {
    req: z
      .object({
        orgId: z.string().min(1),
        targetUserId: z.string().min(1),
      })
      .brand<"AuthOrgMembersDeleteRequest">(),
    res: z.object({
      ok: z.literal(true),
      message: z.string(),
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
   * Requires authenticated session.
   */
  "deploy-subdomain": {
    req: z
      .object({
        slug: z
          .string()
          .min(3, "Slug must be at least 3 characters")
          .max(16, "Slug must be no more than 16 characters")
          .regex(/^[a-z0-9]([a-z0-9-]{1,14}[a-z0-9])?$/, "Slug must be lowercase letters, numbers, and hyphens only")
          .refine(slug => !RESERVED_SLUGS.some(r => r === slug), {
            message: "This slug is reserved and cannot be used. Please choose a different name.",
          }),
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
      .strict()
      .brand<"DeploySubdomainRequest">(),
    res: z.object({
      ok: z.literal(true),
      message: z.string(),
      domain: z.string(),
      chatUrl: z.string(),
      orgId: z.string().optional(),
    }),
  },

  /**
   * POST /api/import-repo
   * Import a GitHub repository as a new site
   * Requires authenticated session with GitHub integration connected
   */
  "import-repo": {
    req: z
      .object({
        slug: z
          .string()
          .min(3, "Slug must be at least 3 characters")
          .max(16, "Slug must be no more than 16 characters")
          .regex(/^[a-z0-9]([a-z0-9-]{1,14}[a-z0-9])?$/, "Slug must be lowercase letters, numbers, and hyphens only")
          .refine(slug => !RESERVED_SLUGS.some(r => r === slug), {
            message: "This slug is reserved and cannot be used. Please choose a different name.",
          }),
        repoUrl: z.string().min(1, "Repository URL is required"),
        branch: z.string().optional(),
        orgId: z.string().min(1, "Organization ID cannot be empty").optional(),
        siteIdeas: z
          .string()
          .max(5000, "Site ideas must be less than 5000 characters")
          .transform(val => val || "")
          .optional()
          .default(""),
      })
      .strict()
      .brand<"ImportRepoRequest">(),
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
          trigger_type: TriggerTypeSchema,
          cron_schedule: z.string().nullable(),
          cron_timezone: z.string().nullable(),
          run_at: z.string().nullable(),
          action_type: z.enum(["prompt", "sync", "publish"]),
          action_prompt: z.string().nullable(),
          action_source: z.string().nullable(),
          action_target_page: z.string().nullable(),
          action_timeout_seconds: z.number().nullable().optional(),
          action_model: ClaudeModelSchema.nullable().optional(),
          skills: z.array(z.string()).nullable(),
          email_address: z.string().nullable().optional(),
          is_active: z.boolean(),
          status: z.enum(["idle", "running", "paused", "disabled"]).optional(),
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
        trigger_type: TriggerTypeSchema,
        cron_schedule: z.string().nullable(),
        cron_timezone: z.string().nullable(),
        run_at: z.string().nullable(),
        action_type: z.enum(["prompt", "sync", "publish"]),
        action_prompt: z.string().nullable(),
        action_source: z.string().nullable(),
        action_target_page: z.string().nullable(),
        action_timeout_seconds: z.number().nullable().optional(),
        action_model: ClaudeModelSchema.nullable().optional(),
        skills: z.array(z.string()).nullable(),
        is_active: z.boolean(),
        status: z.enum(["idle", "running", "paused", "disabled"]).optional(),
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
          result: z.record(z.string(), z.unknown()).nullable(),
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
  // ============================================================================
  // DRIVE (file storage panel)
  // ============================================================================

  /**
   * POST /api/drive/list
   * List files in the drive directory
   */
  "drive/list": {
    req: z
      .object({
        workspace: z.string().min(1),
        path: z.string().default(""),
        worktree: OptionalWorktreeSlugSchema, // Validated to prevent session key corruption
      })
      .brand<"DriveListRequest">(),
    res: z.object({
      ok: z.literal(true),
      path: z.string(),
      files: z.array(
        z.object({
          name: z.string(),
          type: z.enum(["file", "directory"]),
          size: z.number(),
          modified: z.string(),
          path: z.string(),
        }),
      ),
    }),
  },

  /**
   * POST /api/drive/read
   * Read a file from the drive directory
   */
  "drive/read": {
    req: z
      .object({
        workspace: z.string().min(1),
        path: z.string().min(1),
        worktree: OptionalWorktreeSlugSchema, // Validated to prevent session key corruption
      })
      .brand<"DriveReadRequest">(),
    res: z.object({
      ok: z.literal(true),
      path: z.string(),
      filename: z.string(),
      content: z.string(),
      language: z.string(),
      size: z.number(),
    }),
  },

  /**
   * POST /api/drive/delete
   * Delete a file or directory in the drive
   */
  "drive/delete": {
    req: z
      .object({
        workspace: z.string().min(1),
        path: z.string().min(1),
        worktree: OptionalWorktreeSlugSchema, // Validated to prevent session key corruption
        recursive: z.boolean().optional(),
      })
      .brand<"DriveDeleteRequest">(),
    res: z.object({
      ok: z.literal(true),
      deleted: z.string(),
      type: z.enum(["file", "directory"]),
    }),
  },
} as const

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type Endpoint = keyof typeof apiSchemas
export type Req<E extends Endpoint> = PkgReq<typeof apiSchemas, E>
export type Res<E extends Endpoint> = PkgRes<typeof apiSchemas, E>

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
