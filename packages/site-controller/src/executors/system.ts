import { runScript } from './common.js'

export interface EnsureUserParams {
  user: string
  home: string
}

/**
 * Ensure a system user exists
 *
 * @param params - User creation parameters
 */
export async function ensureUser(params: EnsureUserParams): Promise<void> {
  await runScript('01-ensure-user.sh', {
    SITE_USER: params.user,
    SITE_HOME: params.home,
  })
}
