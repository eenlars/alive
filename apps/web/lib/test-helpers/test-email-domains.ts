/**
 * ENFORCED TEST EMAIL DOMAINS
 *
 * Test users MUST use one of these domains for safety.
 * This prevents accidental creation/cleanup of users with real email addresses.
 *
 * CRITICAL SECURITY: These domains are INTERNAL ONLY and should NEVER be used by real users.
 * We use very specific patterns to avoid conflicts with real user emails.
 *
 * IMPORTANT: This list is used by:
 * - createTestUser() - Validates email before creating test user
 * - cleanupTestDatabase() - Only deletes users with these domains AND is_test_env=true
 * - E2E tests - Should use these domains for all test users
 *
 * DO NOT add real/public domains to this list!
 */
export const ALLOWED_TEST_EMAIL_DOMAINS = [
  "@bridge-vitest.internal", // For vitest integration tests
  "@bridge-playwright.internal", // For playwright E2E tests
  "@claude-bridge-test.local", // For other test scenarios
] as const

/**
 * Check if an email uses an allowed test domain
 *
 * @param email - Email to check
 * @returns true if email ends with an allowed test domain and has a user part
 */
export function isTestEmail(email: string): boolean {
  // Must have user part before the @
  if (!email.includes("@") || email.startsWith("@")) {
    return false
  }

  return ALLOWED_TEST_EMAIL_DOMAINS.some(domain => email.endsWith(domain))
}

/**
 * Validate that an email is a test email
 *
 * @param email - Email to validate
 * @throws Error if email doesn't use an allowed test domain
 */
export function validateTestEmail(email: string): void {
  if (!isTestEmail(email)) {
    throw new Error(
      "SECURITY ERROR: Test users MUST use test email domains!\n" +
        `Provided: ${email}\n` +
        `Allowed domains: ${ALLOWED_TEST_EMAIL_DOMAINS.join(", ")}\n` +
        "Example: test-user@test.com",
    )
  }
}

/**
 * Generate a unique test email
 *
 * @param prefix - Optional prefix (default: "test")
 * @param domain - Optional domain (default: "@bridge-vitest.internal")
 * @returns A unique test email like "test-1234567890-abc@bridge-vitest.internal"
 */
export function generateTestEmail(prefix: string = "test", domain: string = "@bridge-vitest.internal"): string {
  if (!ALLOWED_TEST_EMAIL_DOMAINS.includes(domain as any)) {
    throw new Error(`Domain ${domain} is not an allowed test domain`)
  }
  // Use timestamp + random string for uniqueness
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  return `${prefix}-${timestamp}-${random}${domain}`
}
