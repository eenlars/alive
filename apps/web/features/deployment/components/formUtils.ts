/**
 * Generate a random subdomain for quick deploy
 * Uses crypto.randomUUID for secure randomness
 */
export function generateRandomDomain(wildcardDomain: string): string {
  const randomId = crypto.randomUUID().split("-")[0]
  return `${randomId}.${wildcardDomain}`
}

/**
 * Reset all form state when switching deployment modes
 */
export type FormResetCallback = {
  reset: () => void
}

export function createFormResetHandler(
  onModeChange: (mode: "choose") => void,
  onStatusReset: (status: "idle") => void,
  forms: FormResetCallback[],
) {
  return () => {
    onModeChange("choose")
    onStatusReset("idle")
    forms.forEach(form => {
      form.reset()
    })
  }
}
