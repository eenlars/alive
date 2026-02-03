import { runScript } from "./common.js"

export interface SetupFilesystemParams {
  user: string
  domain: string
  targetDir: string
  templatePath: string
}

/**
 * Setup filesystem for a site
 *
 * @param params - Filesystem setup parameters
 */
export async function setupFilesystem(params: SetupFilesystemParams): Promise<void> {
  await runScript("02-setup-fs.sh", {
    SITE_USER: params.user,
    SITE_DOMAIN: params.domain,
    TARGET_DIR: params.targetDir,
    TEMPLATE_PATH: params.templatePath,
  })
}
