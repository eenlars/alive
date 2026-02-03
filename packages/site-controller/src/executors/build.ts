import { runScript } from './common.js'

export interface BuildSiteParams {
  user: string
  domain: string
  port: number
  slug: string
  targetDir: string
  envFilePath: string
}

/**
 * Build a site (install dependencies, run build)
 *
 * @param params - Build parameters
 */
export async function buildSite(params: BuildSiteParams): Promise<void> {
  await runScript('03-build-site.sh', {
    SITE_USER: params.user,
    SITE_DOMAIN: params.domain,
    SITE_PORT: params.port.toString(),
    SITE_SLUG: params.slug,
    TARGET_DIR: params.targetDir,
    ENV_FILE_PATH: params.envFilePath,
  })
}
