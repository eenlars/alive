import path from "node:path"
import { buildSubdomain, WORKSPACE_BASE } from "./config"
import { ensureDirectory, readJsonFile, writeJsonFile } from "./utils/fs-helpers"

export interface SiteMetadata {
  slug: string
  domain: string
  workspace: string
  email?: string // Optional for backward compatibility with old sites
  siteIdeas: string
  templateId?: string // Template ID from Supabase (e.g., "tmpl_gallery")
  /** @deprecated Use templateId instead */
  selectedTemplate?: "landing" | "recipe" // Kept for backward compatibility
  createdAt: number
  port?: number
}

export interface SiteMetadataStore {
  getSite(slug: string): Promise<SiteMetadata | null>
  setSite(slug: string, metadata: SiteMetadata): Promise<void>
  exists(slug: string): Promise<boolean>
}

const METADATA_FILENAME = ".site-metadata.json"

function getMetadataPath(workspace: string): string {
  return path.join(workspace, METADATA_FILENAME)
}

export const siteMetadataStore: SiteMetadataStore = {
  async getSite(slug: string): Promise<SiteMetadata | null> {
    try {
      const domain = buildSubdomain(slug)
      const workspacePath = path.join(WORKSPACE_BASE, domain)
      const metadataPath = getMetadataPath(workspacePath)

      const metadata = await readJsonFile<SiteMetadata>(metadataPath)
      if (!metadata) {
        return null
      }

      if (!metadata.slug || !metadata.domain || !metadata.workspace) {
        console.error(`[Metadata] Invalid metadata structure for slug: ${slug}`)
        return null
      }

      return metadata
    } catch (error) {
      console.error(`[Metadata] Failed to read metadata for slug ${slug}:`, error)
      return null
    }
  },

  async setSite(slug: string, metadata: SiteMetadata): Promise<void> {
    try {
      const workspacePath = path.join(WORKSPACE_BASE, metadata.domain)
      const metadataPath = getMetadataPath(workspacePath)

      const dir = path.dirname(metadataPath)
      await ensureDirectory(dir)

      await writeJsonFile(metadataPath, metadata)
      console.log(`[Metadata] Saved metadata for slug: ${slug}`)
    } catch (error) {
      console.error(`[Metadata] Failed to save metadata for slug ${slug}:`, error)
      throw new Error(`Failed to save site metadata: ${error instanceof Error ? error.message : String(error)}`)
    }
  },

  async exists(slug: string): Promise<boolean> {
    const site = await this.getSite(slug)
    return site !== null
  },
}

export async function getSiteMetadataByWorkspace(workspace: string): Promise<SiteMetadata | null> {
  const metadataPath = getMetadataPath(workspace)
  return await readJsonFile<SiteMetadata>(metadataPath)
}
