import { PATHS } from "@webalive/shared"
import { runScript } from "./common.js"

export interface RenameSiteParams {
  oldDomain: string
  newDomain: string
  oldSlug: string
  newSlug: string
}

/**
 * Rename a site's OS-level resources (user, directory, symlink, systemd, env file).
 * Does NOT touch the database or Caddy — the orchestrator handles those.
 */
export async function renameSiteOS(params: RenameSiteParams): Promise<void> {
  await runScript("10-rename-site.sh", {
    OLD_DOMAIN: params.oldDomain,
    NEW_DOMAIN: params.newDomain,
    OLD_SLUG: params.oldSlug,
    NEW_SLUG: params.newSlug,
    SITES_ROOT: PATHS.SITES_ROOT,
    SYSTEMD_ENV_DIR: PATHS.SYSTEMD_ENV_DIR,
  })
}
