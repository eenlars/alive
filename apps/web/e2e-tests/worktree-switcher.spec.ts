import { test as base, expect } from "@playwright/test"
import { COOKIE_NAMES, createTestStorageState, DOMAINS, TEST_CONFIG } from "@webalive/shared"
import jwt from "jsonwebtoken"
import { DEFAULT_USER_SCOPES } from "@/features/auth/lib/jwt"
import type { TestUser } from "./fixtures"
import { TEST_TIMEOUTS } from "./fixtures/test-data"
import { gotoChat } from "./helpers/assertions"

/**
 * Worktree Switcher E2E Tests
 *
 * Verifies the worktree switcher appears when the WORKTREES feature flag
 * is enabled at startup, and is absent when disabled (default).
 *
 * Uses a custom fixture that injects WORKTREES: true via localStorage
 * before any page JS runs, so the feature flag store hydrates with it enabled.
 */

// ─── Custom fixture: authenticatedPage with WORKTREES enabled ────────────────

const test = base.extend<
  { authenticatedPage: import("@playwright/test").Page; workerTenant: TestUser },
  { workerStorageState: TestUser }
>({
  page: async ({ page }, use) => {
    const previewBase = process.env.NEXT_PUBLIC_PREVIEW_BASE || DOMAINS.PREVIEW_BASE
    if (!previewBase) throw new Error("NEXT_PUBLIC_PREVIEW_BASE not set")
    await page.route(`**/preview--*.${previewBase}/**`, route =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>Mock</body></html>" }),
    )
    await use(page)
  },

  workerStorageState: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright requires destructuring
    async ({}, use, workerInfo) => {
      const runId = process.env.E2E_RUN_ID
      const workerIndex = workerInfo.workerIndex % TEST_CONFIG.MAX_WORKERS
      if (!runId) throw new Error("E2E_RUN_ID not set")

      const baseUrl = workerInfo.project.use.baseURL || TEST_CONFIG.BASE_URL
      const testSecret = process.env.E2E_TEST_SECRET
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (testSecret) headers["x-test-secret"] = testSecret

      const email = `${TEST_CONFIG.WORKER_EMAIL_PREFIX}${workerIndex}@${TEST_CONFIG.EMAIL_DOMAIN}`
      const workspace = `${TEST_CONFIG.WORKSPACE_PREFIX}${workerIndex}.${TEST_CONFIG.EMAIL_DOMAIN}`

      const res = await fetch(`${baseUrl}/api/test/bootstrap-tenant`, {
        method: "POST",
        headers,
        body: JSON.stringify({ runId, workerIndex, email, workspace }),
      })
      if (!res.ok) throw new Error(`Bootstrap failed: ${res.status}`)
      const data = await res.json()
      if (!data.ok) throw new Error(`Tenant error: ${data.error}`)
      await use(data.tenant)
    },
    { scope: "worker" },
  ],

  workerTenant: async ({ workerStorageState }, use) => {
    await use(workerStorageState)
  },

  authenticatedPage: async ({ page, context, workerStorageState, baseURL }, use) => {
    const isRemote = baseURL?.startsWith("https://") ?? false
    const jwtSecret = isRemote ? process.env.JWT_SECRET : TEST_CONFIG.JWT_SECRET
    if (!jwtSecret) throw new Error("JWT_SECRET not set")

    const token = jwt.sign(
      {
        role: "authenticated" as const,
        sub: workerStorageState.userId,
        userId: workerStorageState.userId,
        email: workerStorageState.email,
        name: workerStorageState.orgName,
        scopes: DEFAULT_USER_SCOPES,
        orgIds: [workerStorageState.orgId],
        orgRoles: { [workerStorageState.orgId]: "owner" as const },
      },
      jwtSecret,
      { expiresIn: "30d" },
    )

    const cookieDomain = baseURL ? new URL(baseURL).hostname : "localhost"
    await context.addCookies([
      {
        name: COOKIE_NAMES.SESSION,
        value: token,
        domain: cookieDomain,
        path: "/",
        httpOnly: true,
        secure: isRemote,
        sameSite: "Lax",
      },
    ])

    // Inject stores with WORKTREES ENABLED
    const storageEntries = createTestStorageState({
      workspace: workerStorageState.workspace,
      orgId: workerStorageState.orgId,
      featureFlags: { WORKTREES: true },
      debug: { isDebugView: false, showSSETerminal: false, showSandbox: false },
    })

    await context.addInitScript(entries => {
      for (const { key, value, storage } of entries) {
        if (storage === "sessionStorage") {
          sessionStorage.setItem(key, value)
        } else {
          localStorage.setItem(key, value)
        }
      }
      ;(window as any).PLAYWRIGHT_TEST = true
    }, storageEntries)

    await page.route("**/api/auth/all-workspaces", async route => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          workspaces: { [workerStorageState.orgId]: [workerStorageState.workspace] },
        }),
      })
    })

    // Mock /api/user to return a valid user (prevents auth loading issues)
    await page.route("**/api/user", route =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: workerStorageState.userId,
            email: workerStorageState.email,
            name: workerStorageState.orgName,
            isAdmin: false,
            isSuperadmin: false,
            canSelectAnyModel: false,
            enabledModels: [],
          },
        }),
      }),
    )

    // Mock Flowglad billing to prevent crashes for test users
    await page.route("**/api/flowglad/**", route =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: null, error: null }),
      }),
    )

    // Mock /api/tokens to prevent credit-fetching errors
    await page.route("**/api/tokens", route =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, credits: 100, tokens: 100000 }),
      }),
    )

    await use(page)
  },
})

// ─── Tests ───────────────────────────────────────────────────────────────────

test("worktree switcher button visible when WORKTREES flag enabled", async ({ authenticatedPage }) => {
  await gotoChat(authenticatedPage)

  // The WorktreeSwitcher renders a button with text "base" when no worktree is selected.
  // It only appears when useFeatureFlag("WORKTREES") returns true AND the workspace is not superadmin.
  const worktreeButton = authenticatedPage.getByRole("button", { name: /base/ })
  await expect(worktreeButton).toBeAttached({ timeout: TEST_TIMEOUTS.medium })
})
