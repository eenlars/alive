import type { UploadResponse } from "../types/api"

export function buildErrorMessage(result: Partial<UploadResponse>): string {
  let msg = result.error || "Upload failed"
  if (result.details) msg += `\n\nDetails:\n${result.details.join("\n")}`
  if (result.targetDir) msg += `\n\nTarget: ${result.targetDir}`
  if (result.zipContents) msg += `\n\nZIP contains: ${result.zipContents.join(", ")}`
  if (result.hint) msg += `\n\nHint: ${result.hint}`
  return msg
}
