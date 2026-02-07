import { runScript } from "./common.js"

export interface StartServiceParams {
  slug: string
  port: number
  domain: string
  serviceName: string
}

/**
 * Start systemd service for a site
 *
 * @param params - Service start parameters
 */
export async function startService(params: StartServiceParams): Promise<void> {
  await runScript("04-start-service.sh", {
    SITE_SLUG: params.slug,
    SITE_PORT: params.port.toString(),
    SITE_DOMAIN: params.domain,
    SERVICE_NAME: params.serviceName,
  })
}
