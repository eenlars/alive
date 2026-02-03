/**
 * Email Template Configuration
 *
 * Template IDs from Loops.so dashboard.
 * Each template must be created in Loops.so first, then the ID copied here.
 */
export const EMAIL_TEMPLATES = {
  /**
   * Referral invite email - sent when user shares their invite link
   * Template variables: senderName, inviteLink
   */
  referralInvite: "cmii5921nxtue310iv5fd9cij",
} as const

export type EmailTemplate = keyof typeof EMAIL_TEMPLATES
