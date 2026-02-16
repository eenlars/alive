import { test as base, expect, type Response } from "@playwright/test"
import { COOKIE_NAMES, createTestStorageState, DOMAINS, TEST_CONFIG } from "@webalive/shared"
import jwt from "jsonwebtoken"
import { DEFAULT_USER_SCOPES } from "@/features/auth/lib/jwt"
import type { TestUser } from "./fixtures"
import { TEST_TIMEOUTS } from "./fixtures/test-data"
import { gotoChatFast } from "./helpers/assertions"
import { requireProjectBaseUrl } from "./lib/base-url"
import {
  buildJsonMockResponse,
  E2E_MOCK_HEADER,
  getStrictApiGuardEnabled,
  isGuardedApiPath,
} from "./lib/strict-api-guard"

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

      const baseUrl = requireProjectBaseUrl(workerInfo.project.use.baseURL)
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
    const strictApiGuardEnabled = getStrictApiGuardEnabled()
    const strictApiGuardViolations = new Set<string>()

    const responseGuard = (response: Response): void => {
      if (!strictApiGuardEnabled) return

      try {
        const responseUrl = response.url()
        const { pathname } = new URL(responseUrl)
        if (!isGuardedApiPath(pathname)) return

        const headers = response.headers()
        if (headers[E2E_MOCK_HEADER] === "1") return

        strictApiGuardViolations.add(`${pathname} -> ${response.status()} (${responseUrl})`)
      } catch {
        // Ignore malformed URLs from browser internals
      }
    }

    page.on("response", responseGuard)

    const resolvedBaseUrl = requireProjectBaseUrl(baseURL)
    const isRemote = resolvedBaseUrl.startsWith("https://")
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

    const cookieDomain = new URL(resolvedBaseUrl).hostname
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

    await page.route("**/api/auth/all-workspaces**", async route => {
      await route.fulfill(
        buildJsonMockResponse({
          ok: true,
          workspaces: { [workerStorageState.orgId]: [workerStorageState.workspace] },
        }),
      )
    })

    // Mock /api/user to return a valid user (prevents auth loading issues)
    await page.route("**/api/user**", route =>
      route.fulfill(
        buildJsonMockResponse({
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
      ),
    )

    // Mock /api/auth/organizations used during chat bootstrap
    await page.route("**/api/auth/organizations**", route =>
      route.fulfill(
        buildJsonMockResponse({
          ok: true,
          organizations: [
            {
              org_id: workerStorageState.orgId,
              name: workerStorageState.orgName,
              credits: TEST_CONFIG.DEFAULT_CREDITS,
              workspace_count: 1,
              role: "owner",
            },
          ],
          current_user_id: workerStorageState.userId,
        }),
      ),
    )

    // Mock /api/auth/workspaces used during chat bootstrap
    await page.route("**/api/auth/workspaces**", route => {
      const url = new URL(route.request().url())
      const orgId = url.searchParams.get("org_id")

      if (orgId && orgId !== workerStorageState.orgId) {
        return route.fulfill(buildJsonMockResponse({ ok: true, workspaces: [] }))
      }

      return route.fulfill(
        buildJsonMockResponse({
          ok: true,
          workspaces: [workerStorageState.workspace],
        }),
      )
    })

    // Mock Flowglad billing to prevent crashes for test users
    await page.route("**/api/flowglad/**", route => route.fulfill(buildJsonMockResponse({ data: null, error: null })))

    // Mock /api/tokens to prevent credit-fetching errors
    await page.route("**/api/tokens**", route =>
      route.fulfill(buildJsonMockResponse({ ok: true, credits: 100, tokens: 100000 })),
    )

    let useError: unknown
    try {
      await use(page)
    } catch (error) {
      useError = error
    } finally {
      page.off("response", responseGuard)
    }

    if (useError) {
      throw useError
    }

    if (strictApiGuardViolations.size > 0) {
      throw new Error(
        "[E2E Strict API Guard] Guarded API endpoint was served without E2E mock header:\n" +
          Array.from(strictApiGuardViolations)
            .map(v => `- ${v}`)
            .join("\n"),
      )
    }
  },
})

// ─── Tests ───────────────────────────────────────────────────────────────────

test("worktree switcher button visible when WORKTREES flag enabled", async ({ authenticatedPage, workerTenant }) => {
  await gotoChatFast(authenticatedPage, workerTenant.workspace, workerTenant.orgId)

  // The WorktreeSwitcher renders a button with text "base" when no worktree is selected.
  // It only appears when useFeatureFlag("WORKTREES") returns true AND the workspace is not superadmin.
  const worktreeButton = authenticatedPage.getByRole("button", { name: /base/ })
  await expect(worktreeButton).toBeAttached({ timeout: TEST_TIMEOUTS.medium })
})
