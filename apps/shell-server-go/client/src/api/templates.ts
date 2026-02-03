// Templates API functions

export interface TemplateListItem {
  id: string
  templateId: string
  name: string
  description: string
  category: string
  complexity: number
  fileCount: number
  dependencies: string[]
  estimatedTime: string
  estimatedTokens: number
  tags: string[]
  requires: string[]
  previewImage: string
}

export interface ListTemplatesResponse {
  templates: TemplateListItem[]
  error?: string
}

export interface GetTemplateResponse {
  id: string
  path: string
  content: string
  error?: string
}

export interface SaveTemplateResponse {
  success: boolean
  id: string
  path: string
  error?: string
}

export async function listTemplates(): Promise<ListTemplatesResponse> {
  const res = await fetch("/api/templates", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  })
  return res.json()
}

export async function getTemplate(id: string): Promise<GetTemplateResponse> {
  const res = await fetch(`/api/templates/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  })
  return res.json()
}

export async function saveTemplate(id: string, content: string): Promise<SaveTemplateResponse> {
  const res = await fetch(`/api/templates/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  })
  return res.json()
}

export interface CreateTemplateRequest {
  name: string
  description?: string
  category: string
  content?: string // Full template content (with frontmatter) - if provided, name/category are extracted from it
}

export interface ValidationError {
  field: string
  message: string
}

export interface CreateTemplateResponse {
  success: boolean
  id: string
  path: string
  category: string
  error?: string
  validationErrors?: ValidationError[]
  message?: string
}

export async function createTemplate(req: CreateTemplateRequest): Promise<CreateTemplateResponse> {
  const res = await fetch("/api/templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  })
  return res.json()
}
