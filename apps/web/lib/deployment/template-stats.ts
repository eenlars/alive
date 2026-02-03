/**
 * Template Statistics
 * Tracks template usage metrics
 */

import { createAppClient } from "@/lib/supabase/app"

/**
 * Increment the deploy_count for a template
 * Note: Not fully atomic but sufficient for analytics purposes
 */
export async function incrementTemplateDeployCount(templateId: string): Promise<void> {
  const supabase = await createAppClient("service")

  // First get current count
  const { data: template, error: fetchError } = await supabase
    .from("templates")
    .select("deploy_count")
    .eq("template_id", templateId)
    .single()

  if (fetchError) {
    console.error("[Template Stats] Failed to fetch template:", fetchError)
    return
  }

  // Then increment
  const newCount = (template?.deploy_count ?? 0) + 1
  const { error: updateError } = await supabase
    .from("templates")
    .update({ deploy_count: newCount })
    .eq("template_id", templateId)

  if (updateError) {
    console.error("[Template Stats] Failed to update deploy count:", updateError)
  }
}
