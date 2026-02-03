/**
 * Template validation using Supabase
 * Replaces the hardcoded TEMPLATES config with database-backed validation
 */

import { existsSync } from "node:fs"
import { createAppClient } from "@/lib/supabase/app"

export interface ValidatedTemplate {
  template_id: string
  name: string
  source_path: string
  is_active: boolean
}

export interface TemplateValidationResult {
  valid: boolean
  template?: ValidatedTemplate
  error?: {
    code: "INVALID_TEMPLATE" | "TEMPLATE_NOT_FOUND" | "TEMPLATE_INACTIVE"
    templateId?: string
    message: string
  }
}

/**
 * Validate a template ID against Supabase and check if source path exists
 */
export async function validateTemplateFromDb(templateId: string | undefined): Promise<TemplateValidationResult> {
  if (!templateId) {
    return {
      valid: false,
      error: {
        code: "INVALID_TEMPLATE",
        message: "Template ID is required",
      },
    }
  }

  const supabase = await createAppClient("service")

  const { data: template, error } = await supabase
    .from("templates")
    .select("template_id, name, source_path, is_active")
    .eq("template_id", templateId)
    .single()

  if (error || !template) {
    return {
      valid: false,
      error: {
        code: "INVALID_TEMPLATE",
        templateId,
        message: `Template "${templateId}" not found`,
      },
    }
  }

  if (!template.is_active) {
    return {
      valid: false,
      error: {
        code: "TEMPLATE_INACTIVE",
        templateId,
        message: `Template "${templateId}" is not active`,
      },
    }
  }

  if (!existsSync(template.source_path)) {
    return {
      valid: false,
      error: {
        code: "TEMPLATE_NOT_FOUND",
        templateId,
        message: `Template source path does not exist: ${template.source_path}`,
      },
    }
  }

  return {
    valid: true,
    template: {
      template_id: template.template_id,
      name: template.name,
      source_path: template.source_path,
      is_active: template.is_active,
    },
  }
}
