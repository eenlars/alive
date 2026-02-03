"use client"

import { GrepOutput } from "@/components/ui/chat/tools/grep/GrepOutput"

export function GrepOutputPreview() {
  return (
    <div className="space-y-8">
      {/* Content Mode (with matches) */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Content Mode</h3>
        <div className="max-w-lg">
          <GrepOutput
            matches={[
              {
                file: "src/components/Button.tsx",
                line_number: 5,
                line: "export function Button({ children, onClick }) {",
              },
              {
                file: "src/components/Card.tsx",
                line_number: 8,
                line: "export function Card({ title, children }) {",
              },
              {
                file: "src/components/Modal.tsx",
                line_number: 12,
                line: "export function Modal({ isOpen, onClose, children }) {",
              },
            ]}
            total_matches={3}
          />
        </div>
      </section>

      {/* Content Mode with Context */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">With Context Lines</h3>
        <div className="max-w-lg">
          <GrepOutput
            matches={[
              {
                file: "src/api/users.ts",
                line_number: 15,
                before_context: ["async function fetchUser(id: string) {", "  try {"],
                line: "    const user = await db.users.findById(id)",
                after_context: ["    return user", "  } catch (err) {"],
              },
            ]}
            total_matches={1}
          />
        </div>
      </section>

      {/* Files Mode */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Files Mode</h3>
        <div className="max-w-lg">
          <GrepOutput
            files={["src/utils/auth.ts", "src/middleware/auth.ts", "src/pages/api/auth.ts", "src/hooks/useAuth.ts"]}
            count={4}
          />
        </div>
      </section>

      {/* Count Mode */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Count Mode</h3>
        <div className="max-w-lg">
          <GrepOutput
            counts={[
              { file: "src/components/Button.tsx", count: 12 },
              { file: "src/components/Input.tsx", count: 8 },
              { file: "src/components/Card.tsx", count: 5 },
              { file: "src/utils/helpers.ts", count: 3 },
            ]}
            total={28}
          />
        </div>
      </section>
    </div>
  )
}
