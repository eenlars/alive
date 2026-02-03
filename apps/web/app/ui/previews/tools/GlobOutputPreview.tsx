"use client"

import { GlobOutput } from "@/components/ui/chat/tools/glob/GlobOutput"

export function GlobOutputPreview() {
  return (
    <div className="space-y-8">
      {/* Few Matches */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Few Matches</h3>
        <div className="max-w-lg">
          <GlobOutput
            matches={["src/components/Button.tsx", "src/components/Card.tsx", "src/components/Modal.tsx"]}
            count={3}
            search_path="src/components"
          />
        </div>
      </section>

      {/* Many Matches */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Many Matches</h3>
        <div className="max-w-lg">
          <GlobOutput
            matches={[
              "src/pages/index.tsx",
              "src/pages/about.tsx",
              "src/pages/dashboard/index.tsx",
              "src/pages/dashboard/settings.tsx",
              "src/pages/dashboard/profile.tsx",
              "src/pages/auth/login.tsx",
              "src/pages/auth/register.tsx",
              "src/pages/auth/forgot-password.tsx",
              "src/pages/blog/index.tsx",
              "src/pages/blog/[slug].tsx",
            ]}
            count={10}
            search_path="src/pages"
          />
        </div>
      </section>

      {/* Single Match */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Single Match</h3>
        <div className="max-w-lg">
          <GlobOutput matches={["package.json"]} count={1} search_path="." />
        </div>
      </section>
    </div>
  )
}
