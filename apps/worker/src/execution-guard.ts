import { DOMAINS, STREAM_ENV } from "@webalive/shared"

const AUTOMATION_PRIMARY_MAIN_DOMAIN = "alive.best"

export interface AutomationExecutionGate {
  allowed: boolean
  reason: string
}

export function getAutomationExecutionGate(input?: {
  streamEnv?: string
  mainDomain?: string
}): AutomationExecutionGate {
  const streamEnv = input?.streamEnv ?? process.env.STREAM_ENV
  const mainDomain = input?.mainDomain ?? DOMAINS.MAIN

  if (streamEnv !== STREAM_ENV.PRODUCTION) {
    return {
      allowed: false,
      reason: `STREAM_ENV must be production (got ${streamEnv ?? "unset"})`,
    }
  }

  if (!mainDomain) {
    return { allowed: false, reason: "Main domain is not configured" }
  }

  if (mainDomain !== AUTOMATION_PRIMARY_MAIN_DOMAIN) {
    return {
      allowed: false,
      reason: `Automations are disabled on main domain ${mainDomain}`,
    }
  }

  return { allowed: true, reason: "ok" }
}
