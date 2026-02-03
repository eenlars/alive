"use client"

import { BashOutput } from "@/components/ui/chat/tools/bash/BashOutput"

export function BashOutputPreview() {
  return (
    <div className="space-y-8">
      {/* Success */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Success</h3>
        <div className="max-w-lg">
          <BashOutput
            output={`> project@1.0.0 build
> next build

   Creating an optimized production build...
   Compiled successfully!

   Route (app)                              Size
   /                                        5.2 kB
   /dashboard                              12.4 kB
   /api/users                               1.8 kB

   Build completed in 8.2s`}
            exitCode={0}
          />
        </div>
      </section>

      {/* Failed */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Failed (Exit Code 1)</h3>
        <div className="max-w-lg">
          <BashOutput
            output={`npm ERR! code ENOENT
npm ERR! syscall open
npm ERR! path /app/package.json
npm ERR! errno -2
npm ERR! enoent Could not read package.json`}
            exitCode={1}
          />
        </div>
      </section>

      {/* Killed (Timeout) */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Killed (Timeout)</h3>
        <div className="max-w-lg">
          <BashOutput
            output={`Running long process...
Step 1/10 complete
Step 2/10 complete
Step 3/10 complete`}
            exitCode={137}
            killed={true}
          />
        </div>
      </section>

      {/* Background Shell */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Background Shell</h3>
        <div className="max-w-lg">
          <BashOutput
            output={`Server running on http://localhost:3000
Ready in 1.2s`}
            exitCode={0}
            shellId="abc123"
          />
        </div>
      </section>

      {/* Empty Output */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Empty Output</h3>
        <div className="max-w-lg">
          <BashOutput output="" exitCode={0} />
        </div>
      </section>
    </div>
  )
}
