import { z } from "zod"

export interface DeploySubdomainForm {
  slug: string
  siteIdeas?: string
  orgId?: string
  templateId?: string
}

export const DeployResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  domain: z.string().optional(),
  errors: z.array(z.string()).optional(),
})

export const SiteLimitDetailsSchema = z.object({
  limit: z.number().optional(),
  currentCount: z.number().optional(),
})

export const DeploySubdomainResponseSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  domain: z.string().optional(),
  chatUrl: z.string().optional(),
  orgId: z.string().optional(),
  error: z.string().optional(),
  details: z.union([SiteLimitDetailsSchema, z.string()]).optional(),
})

export type DeployResponse = z.infer<typeof DeployResponseSchema>
export type SiteLimitDetails = z.infer<typeof SiteLimitDetailsSchema>
export type DeploySubdomainResponse = z.infer<typeof DeploySubdomainResponseSchema>
