import { DOMAINS } from "@webalive/shared"
import NextTopLoader from "nextjs-toploader"
import { NuqsAdapter } from "nuqs/adapters/next/app"
import { AuthModal } from "@/components/modals/AuthModal"
import { FlowgladProviderWrapper } from "@/components/providers/FlowgladProviderWrapper"
import { PostHogProvider } from "@/components/providers/PostHogProvider"
import { ThemeProvider } from "@/components/providers/theme-provider"
import { DomainConfigProvider } from "@/lib/providers/DomainConfigProvider"
import { QueryClientProvider } from "@/lib/providers/QueryClientProvider"
import { SkillsStoreProvider } from "@/lib/providers/SkillsStoreProvider"
import { UserStoreProvider } from "@/lib/providers/UserStoreProvider"
import { HydrationManager } from "@/lib/stores/HydrationBoundary"
import "@/lib/env-validation" // Validate env vars at startup (fail fast)
import "./globals.css"

/**
 * CRITICAL: Import env validation to trigger build-time checks
 * This import ensures missing environment variables fail the build immediately.
 * The validation runs during Next.js static analysis (build phase).
 */
import "@/lib/env-validation"

export const metadata = {
  title: "Alive",
}

// Server-side: read domain config from server-config.json (runtime, not build time)
const domainConfig = {
  wildcard: DOMAINS.WILDCARD,
  main: DOMAINS.MAIN,
  previewBase: DOMAINS.PREVIEW_BASE,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
      </head>
      <body>
        {/* HydrationManager coordinates hydration of ALL persisted stores */}
        {/* Must be early in the tree to hydrate stores before components use them */}
        {/* Sets window.__APP_HYDRATED__ for E2E test synchronization */}
        <HydrationManager />
        <PostHogProvider>
          <NextTopLoader color="#000" height={2} showSpinner={false} />
          <NuqsAdapter>
            <ThemeProvider>
              <DomainConfigProvider config={domainConfig}>
                <QueryClientProvider>
                  <FlowgladProviderWrapper>
                    <UserStoreProvider>
                      <SkillsStoreProvider>
                        {children}
                        <AuthModal />
                      </SkillsStoreProvider>
                    </UserStoreProvider>
                  </FlowgladProviderWrapper>
                </QueryClientProvider>
              </DomainConfigProvider>
            </ThemeProvider>
          </NuqsAdapter>
        </PostHogProvider>
      </body>
    </html>
  )
}
