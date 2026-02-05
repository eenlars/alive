# CodeRabbit TODO Items (PR #12 - Worktrees)

These are nitpick and outside-diff-range comments from CodeRabbit that were not addressed in the initial fix.

Generated: 2026-02-05

---

## Nitpicks (5)

Minor improvements suggested by CodeRabbit.

### apps/web/app/api/images/upload/route.ts

`29-36`: **Consider logging the worktree parameter for debugging consistency.** The `worktreeParam` is extracted but not included in the log statement on Line 36, which could make debugging worktree-related issues harder. Also, the nested ternary for `body` construction is somewhat hard to follow. Consider a more explicit approach: ♻️ Proposed refactor for readability ```diff const workspaceParam = formData.get("workspace") as string | null const worktreeParam = formData.get("worktree") as string | null - const body = - workspaceParam && worktreeParam - ? { workspace: workspaceParam, worktree: worktreeParam } - : workspaceParam - ? { workspace: workspaceParam } - : {} - console.log(`[Image Upload ${requestId}] Workspace param: ${workspaceParam || "(none)"}`) + const body: { workspace?: string; worktree?: string } = {} + if (workspaceParam) { + body.workspace = workspaceParam + if (worktreeParam) { + body.worktree = worktreeParam + } + } + console.log(`[Image Upload ${requestId}] Worksp

---

### apps/web/lib/api/schemas.ts

`490-498`: **Reuse OptionalWorktreeSchema for slug validation.** `slug: z.string().optional()` lets invalid/empty values pass `validateRequest`. Prefer the shared worktree schema so client-side validation matches server expectations. Proposed change ```diff "worktrees/create": { req: z .object({ workspace: z.string(), - slug: z.string().optional(), + slug: OptionalWorktreeSchema, branch: z.string().optional(), from: z.string().optional(), }) .brand(), ```

---

### apps/web/features/chat/lib/__tests__/workspace-naming-regression.test.ts

`23-38`: **Consider a small test helper to de-duplicate the “missing site” skip logic.** The same skip/warn pattern appears in multiple tests; a helper keeps maintenance simpler and avoids drift. ♻️ Suggested refactor ```diff +function skipIfMissing(path: string, extraMessage?: string) { + if (existsSync(path)) return false + console.warn(`⚠️ Test site missing: ${path}`) + if (extraMessage) console.warn(extraMessage) + return true +} + it("CRITICAL: finds evermore.alive.best with DOTS in directory name", async () => { // Verify the actual directory exists with DOTS const dotsPath = "/srv/webalive/sites/evermore.alive.best/user" const hyphensPath = "/srv/webalive/sites/evermore-alive-best/user" - if (!existsSync(dotsPath)) { - console.warn(`⚠️ Test site missing: ${dotsPath}`) - console.warn("This test requires evermore.alive.best to exist") - return // Skip if test site doesn't exist - } + if (skipIfMissing(dotsPath, "This test requires evermore.alive.best to exist")) return const resul

---

### packages/site-controller/scripts/05-caddy-inject.sh

`24-28`: **Add sanity checks / overrides for STREAM_ROOT and SERVER_CONFIG.** Fail fast with a clearer message if the default path is missing, and allow overrides for non-standard installs or tests. ♻️ Suggested tweak ```diff -STREAM_ROOT="${STREAM_ROOT:-/root/alive}" +STREAM_ROOT="${STREAM_ROOT:-/root/alive}" +if [[ ! -d "$STREAM_ROOT" ]]; then + log_error "STREAM_ROOT not found: $STREAM_ROOT" + exit 15 +fi -SERVER_CONFIG="/var/lib/alive/server-config.json" +SERVER_CONFIG="${SERVER_CONFIG:-/var/lib/alive/server-config.json}" +if [[ -f "$SERVER_CONFIG" && ! -r "$SERVER_CONFIG" ]]; then + log_error "SERVER_CONFIG not readable: $SERVER_CONFIG" + exit 15 +fi ```

---

### scripts/deployment/lib/standalone-packages.sh

`18-33`: **Optional: mark arrays as intentional exports and silence SC2034.** Since this file is sourced, Shellcheck flags these as unused locally. Consider making intent explicit to reduce noise. ♻️ Proposed tweak ```diff -# Packages to copy to standalone build -# Format: space-separated list of package names (from packages/ directory) -STANDALONE_PACKAGES=( +# shellcheck disable=SC2034 +# Packages to copy to standalone build +# Format: space-separated list of package names (from packages/ directory) +readonly -a STANDALONE_PACKAGES=( tools images shared worker-pool site-controller database ) # Packages that have external dependencies needed in subprocess # These get their node_modules copied too (via cp -rL) -SUBPROCESS_PACKAGES=( +readonly -a SUBPROCESS_PACKAGES=( worker-pool ) ```

---

## Outside Diff Range (10)

Issues in files that were touched but the specific lines weren't in the diff.

### apps/web/tsconfig.json

`35-45`: **Remove the redundant `.next-test/dev/dev/types/**/*.ts` include path.**

Line 44 duplicates the "dev" segment and appears to be a typo. The correct pattern follows the structure of `.next` → `.next/dev` and `.next-test` → `.next-test/dev`. Remove this line, as it is already covered by line 40 (`.next-test/dev/types/**/*.ts`) and no references to this doubled path exist in the codebase.

---

### apps/web/features/chat/lib/__tests__/workspace-naming-regression.test.ts

`23-38`: **Add `isPathWithinWorkspace()` validation before file access.**

`existsSync` is used on `dotsPath`/`hyphensPath` without path validation. Please guard file operations with `isPathWithinWorkspace()` to satisfy the workspace traversal protection requirement.

---

### apps/web/features/chat/components/sandbox/FileTree.tsx

`125-138`: 🟠 **Missing `worktree` prop when rendering TreeNode.**

`TreeNode` accepts a `worktree` prop (line 145), but it's not passed when rendered from `TreeLevel` (lines 126-137). This will cause nested tree levels to lose the worktree context, resulting in incorrect cache keys and API calls.

```diff
 {files.map(item => (
   <TreeNode
     key={item.path}
+    worktree={worktree}
     ...
```

---

### apps/web/app/chat/page.tsx

`806-828`: 🟠 **Switch ChatInput usages to the compound pattern.**

Both desktop and mobile inputs still use `<ChatInput ... />`. Please refactor to the compound API (e.g., `<ChatInput><ChatInput.InputArea />...</ChatInput>`), which is required for extension via composition.

Also applies to: 862-881

---

### apps/web/features/chat/lib/workspaceRetriever.ts

`136-152`: 🟠 **Add isPathWithinWorkspace() guard before filesystem checks.**

`existsSync` on Line 152 runs without an `isPathWithinWorkspace()` validation. Please validate the absolute candidate path before the filesystem access.

---

### scripts/maintenance/setup-auto-cleanup.sh

`30-32`: **Duplicate `OnCalendar` directives will trigger the timer twice daily.**

The comment says "Run daily at 3 AM", but there are two `OnCalendar` entries:
- `OnCalendar=daily` triggers at midnight (00:00:00)
- `OnCalendar=*-*-* 03:00:00` triggers at 3 AM

Systemd fires the timer at **both** times. Remove line 31 to run only at 3 AM as intended.

```diff
 [Timer]
 # Run daily at 3 AM
-OnCalendar=daily
 OnCalendar=*-*-* 03:00:00
 Persistent=true
```

---

### packages/site-controller/scripts/99-teardown.sh

`159`: **Inconsistency: `SITES_ROOT` uses outdated path scheme.**

Within the same script, three different path schemes coexist:
- `/root/alive` (STREAM_ROOT, line 39)
- `/var/lib/alive` (SERVER_CONFIG, line 40)
- `/srv/webalive/sites` (SITES_ROOT, line 159)

If this is part of a broader migration to the new path structure, `SITES_ROOT` should be updated. If these directories serve intentionally separate purposes, document the architectural decision.

---

### packages/worker-pool/scripts/check-import-order.mjs

`199-204`: 🔴 **CRITICAL: Add `@webalive/tools` to packages/worker-pool/package.json.**

The import is present in worker-entry.mjs (line 33), but the dependency is missing from package.json. Since the check-import-order.mjs script now enforces `@webalive/tools` as a required top-level import, CI will fail without the dependency declaration.

---

### ops/scripts/pre-deployment-check.sh

`89-101`: **Guard disk-usage check against missing build dir.**

With `set -e`, `df "$BUILD_DIR"` aborts the script if the new path doesn't exist yet, so you won't reach the summary or the explicit "build directory not found" check later. Consider guarding the disk-usage check with a directory existence test.

---


