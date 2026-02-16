import { z } from "zod"

export const RenderEventTypeSchema = z.enum([
  "render.queued",
  "render.started",
  "render.succeeded",
  "render.failed",
])

export const RendererEventSchema = z.object({
  type: RenderEventTypeSchema,
  projectId: z.string().min(1),
  jobId: z.string().min(1),
  filePath: z.string().min(1).optional(),
  timestamp: z.string().datetime(),
  error: z.string().optional(),
})

export type RenderEventType = z.infer<typeof RenderEventTypeSchema>
export type RendererEvent = z.infer<typeof RendererEventSchema>
