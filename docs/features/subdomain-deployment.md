# Subdomain Deployment: Core Problem & Solution

## The Problem (30 seconds)

**Current bottleneck:** Users must own a domain, configure DNS, wait for propagation, and deal with Cloudflare proxy settings. This kills conversion for anyone who just wants to build a website.

**What we're solving:** One-click deployment to auto-generated subdomains. User submits slug + site ideas → gets a live URL → Claude starts building immediately.

**Why it matters:** Removes the DNS friction entirely. The deployment becomes invisible.

---

## Core Architecture (No Complexity)

### Three Simple Steps

**Step 1: User submits**
```
POST /api/deploy { slug, siteIdeas, password }
```

**Step 2: We deploy to wildcard subdomain**
```
alice.alive.best → /srv/webalive/sites/alice.alive.best/user
```

**Step 3: Chat opens with context**
```
/chat?slug=alice&autoStart=true
Claude sees: "Build portfolio with dark theme..."
```

That's it. No database, no fancy orchestration, no state machines.

---

## System Schematic

```
┌─────────────────────────────────────────────────────────────────┐
│                      USER BROWSER                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                   Form: slug + ideas
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DEPLOY ENDPOINT                              │
│                  /api/deploy (route.ts)                         │
│                                                                 │
│  1. Parse: { slug, siteIdeas, password }                       │
│  2. Validate: slug format, ideas length, no duplicates         │
│  3. Build: fullDomain = "slug.alive.best"                  │
│  4. Execute: bash deploy-site-systemd.sh fullDomain            │
│  5. Save: SiteMetadataStore.setSite(slug, metadata)            │
│  6. Return: { domain, chatUrl: "/chat?slug=slug" }             │
└─────────────────────────────────────────────────────────────────┘
         │                           │                    │
    Deploy       Metadata         Response            Redirect
    Script       Storage          to Browser          to Chat
         │                           │                    │
         ▼                           ▼                    ▼
┌──────────────┐      ┌──────────────────────┐    Browser
│   Systemd    │      │  Filesystem Storage  │    Redirects
│   Service    │      │                      │
│  (port 3349) │      │  /srv/webalive/sites/│
│              │      │   alice.yourdomain.. │
│ Creates:     │      │   .site-metadata.json│
│ -user        │      │  {slug, domain,      │
│ -src/        │      │   siteIdeas, ...}    │
│ -files       │      │                      │
└──────────────┘      └──────────────────────┘
         │
         ▼
    Site live at
  alice.alive.best
```

---

## File Structure Schematic

```
/srv/webalive/sites/
│
└── alice.alive.best/                    ← Created by deploy script
    ├── user/                                 ← Workspace root
    │   ├── src/                              ← User project files
    │   │   ├── index.html
    │   │   ├── style.css
    │   │   └── ...
    │   ├── .site-metadata.json               ← NEW: Site context
    │   │   {
    │   │     "slug": "alice",
    │   │     "domain": "alice.alive.best",
    │   │     "siteIdeas": "Portfolio with...",
    │   │     "workspace": "/srv/webalive/...",
    │   │     "createdAt": 1699027423000
    │   │   }
    │   └── node_modules/
    │
    └── [systemd manages permissions]
        User: site-alice-yourdomain-tld
        Port: 3349 (auto-assigned)
```

---

## Request Flow Schematic

```
Timeline (30 seconds total)

T=0s   ┌─ User clicks "Deploy"
       │  Form data: { slug: "alice", siteIdeas: "...", password: "..." }
       │
T=0.1s ├─ POST /api/deploy
       │  Validation (instant)
       │  ✓ Slug format valid
       │  ✓ Ideas 10-5000 chars
       │  ✓ Slug not taken
       │
T=0.5s ├─ Build fullDomain: alice.alive.best
       │  Check: /srv/.../alice.alive.best exists? → No ✓
       │
T=1s   ├─ Execute: bash deploy-site-systemd.sh alice.alive.best
       │  ├─ Validate DNS (SKIPPED for wildcard)
       │  ├─ Assign port: 3349
       │  ├─ Create system user
       │  ├─ Copy template files
       │  ├─ Install deps (bun install) — ~15s
       │  ├─ Build (bun run build) — ~10s
       │  ├─ Start systemd service
       │  └─ Verify listening on 3349
       │
T=27s  ├─ Validate SSL certificate
       │  Polling: curl -I https://alice.alive.best
       │  (Usually instant with wildcard, max 60s)
       │  Response: HTTP 200 ✓
       │
T=28s  ├─ Save metadata
       │  Write: /srv/.../alice.alive.best/user/.site-metadata.json
       │  Content: { slug, domain, siteIdeas, workspace, createdAt }
       │
T=29s  ├─ Return response
       │  {
       │    "success": true,
       │    "domain": "alice.alive.best",
       │    "chatUrl": "/chat?slug=alice&autoStart=true"
       │  }
       │
T=30s  └─ Browser redirects to chat
          GET /chat?slug=alice&autoStart=true
```

---

## Chat Initialization Schematic

```
Browser navigates to: /chat?slug=alice&autoStart=true

ChatPage Component Mounts
       │
       ├─ Parse URL params: slug="alice", autoStart=true
       │
       ├─ Fetch metadata
       │  GET /api/sites/metadata?slug=alice
       │  Response: { slug, domain, siteIdeas, workspace, ... }
       │
       ├─ Pre-fill message input
       │  "I want to build a website with these ideas:\n\n{siteIdeas}\n\nCan you help me get started?"
       │
       ├─ Set workspace context
       │  workspace="/srv/webalive/sites/alice.alive.best/user"
       │
       └─ Auto-submit message
          POST /api/claude/stream
          {
            "message": "I want to build...",
            "workspace": "/srv/webalive/sites/alice.alive.best/user",
            "conversationId": "uuid"
          }
                     │
                     ▼
          System Prompt Enriched:
          "You are a design consultant AND software engineer...

           Additional context: Build a portfolio with dark theme, clean typography...

           The current workspace folder is: /srv/webalive/sites/alice.alive.best/user"
                     │
                     ▼
          Claude Responds with Context-Aware Suggestion:
          "I see you want to build a portfolio with dark theme.
           Here's my plan:
           1. Create a dark-themed landing page...
           2. Add portfolio showcase section...
           3. Implement animations for..."
```

---

## What Actually Exists (Reuse Table)

| Component | Current State | Needed? | Risk |
|-----------|---|---|---|
| Systemd deployment | Works perfectly | Yes, unchanged | None |
| Wildcard DNS | Already set up | Yes, verified working | None |
| System prompt parameterization | Built in | Yes, just use `additionalContext` | None |
| Session management | Exists | Yes, reuse SessionStore pattern | None |
| Chat page | Works | Minimal changes (query params) | Low |
| Workspace resolution | Works for any path | Yes, unchanged | None |
| SSL/Caddy | Auto-provisions wildcards | Yes, just works | None |

**Real work (rewrite percentage):**
- Deploy API: 20% new (slug input, metadata save)
- Chat page: 5% new (query param parsing)
- Everything else: 0% changes

---

## Boxes to Tick (What Must Work)

1. **Deploy creates subdomain** — `POST /api/deploy` with slug → creates `slug.alive.best` running systemd service listening on available port ✓ Verifiable by: curl https://slug.alive.best returns 200

2. **Slug validation works** — rejects invalid (uppercase, special chars), detects conflicts, prevents reserved names ✓ Verifiable by: test cases cover 10 edge cases, validation is sync (no DB queries)

3. **Site ideas persist** — metadata saved after deploy, retrievable via `/api/sites/metadata?slug=alice` ✓ Verifiable by: file exists in workspace, can read it back

4. **Chat auto-initializes** — query param `?slug=alice&autoStart=true` → fetches metadata → pre-fills message → sends it ✓ Verifiable by: message appears in chat, Claude responds with context-aware suggestions

5. **Claude gets context** — system prompt includes site ideas via `additionalContext` parameter ✓ Verifiable by: Claude's first response references specific site requirements

6. **No DNS validation breaks** — deploy script doesn't require checking if slug.alive.best→our-IP (wildcard = trusted) ✓ Verifiable by: skip dig check if domain ends with `.alive.best`

7. **Password still works** — existing password field still gates access to deploy endpoint ✓ Verifiable by: wrong password returns 401

8. **Existing deploy flow untouched** — old domain-based deployments still work for backward compatibility ✓ Verifiable by: old /api/deploy endpoint still accepts `{ domain, password }` format

---

## Questions to Answer (Kill Assumptions)

1. **Do we need a database for metadata?**
   - No. File per site: `/srv/webalive/sites/{slug}.alive.best/.site-metadata.json`
   - Simple JSON. No schema migrations. No connection pools.
   - Scales to 100k sites (file I/O is cheap). Upgrade to DB only if we have scaling problems we can measure.

2. **Do we need to store the password?**
   - No. Password is only for authentication (matching against environment DEPLOY_PASSWORD).
   - Don't persist it anywhere. It's ephemeral per request.

3. **Do we need per-user namespacing for slugs?**
   - No. Global namespace is simpler. `alice` is globally reserved.
   - If multi-user comes later, check `user_id + slug` uniqueness. Not a constraint now.

4. **Do we need request queuing/rate limiting?**
   - No. Deploy takes ~30 seconds. If someone spams, they tie up their own connection.
   - Add rate limiting when we see abuse. Start with nothing.

5. **Do we need to validate DNS before deploy?**
   - No. Wildcard is proven. Skip all DNS checks for `*.alive.best` domains.
   - If manual domain still supported, keep DNS validation only for non-wildcard.

6. **Do we need to wait for SSL cert before returning?**
   - Yes (that part exists). But for wildcard: cert is already issued. Just verify it resolves.
   - Current polling (60 seconds max) is fine. Wildcard will be instant.

7. **Do we need to handle slug name collisions gracefully?**
   - Check if `/srv/webalive/sites/{slug}.alive.best` exists before deploy.
   - Return 409 Conflict. Done. No fancy retry logic.

8. **Do we need a UI for managing/deleting sites?**
   - No. Out of scope. Delete via filesystem if needed.
   - Can add `/api/sites/delete` later if we see demand.

---

## Proof Strategy (How We Know It Works)

### Proof 1: Deploy Creates Working Subdomain
```bash
# Test: Deploy with slug="proof1"
curl -X POST https://alive.best/api/deploy \
  -d '{"slug":"proof1","siteIdeas":"test site","password":"test123"}'

# Verify response includes: domain="proof1.alive.best", chatUrl="/chat?slug=proof1"

# Verify site is live:
curl -I https://proof1.alive.best
# Expect: HTTP 200, valid SSL cert
```

### Proof 2: Metadata Persists & Is Retrievable
```bash
# Verify file exists:
ls -l /srv/webalive/sites/proof1.alive.best/.site-metadata.json

# Verify we can fetch it:
curl https://alive.best/api/sites/metadata?slug=proof1
# Expect: JSON with { slug, domain, siteIdeas, workspace, createdAt }
```

### Proof 3: Chat Initializes with Context
```bash
# Navigate to:
https://alive.best/chat?slug=proof1&autoStart=true

# Verify:
1. Query params parsed correctly
2. Metadata fetched from API (check Network tab)
3. Initial message pre-filled with site ideas
4. Message auto-submitted (one request sent)
5. Claude's response mentions the site ideas (context received)
```

### Proof 4: Slug Validation Rejects Invalid Input
```bash
# Test uppercase (should fail):
curl -X POST .../api/deploy -d '{"slug":"Proof1",...}'
# Expect: 400 Invalid slug format

# Test special chars (should fail):
curl -X POST .../api/deploy -d '{"slug":"proof@1",...}'
# Expect: 400 Invalid slug format

# Test reserved name (should fail):
curl -X POST .../api/deploy -d '{"slug":"admin",...}'
# Expect: 409 Reserved slug

# Test duplicate (should fail):
curl -X POST .../api/deploy -d '{"slug":"proof1",...}'
# Expect: 409 Slug already exists

# Test valid (should succeed):
curl -X POST .../api/deploy -d '{"slug":"proof1-valid",...}'
# Expect: 200 with domain
```

### Proof 5: Old Deploy Flow Still Works
```bash
# Old format (domain-based):
curl -X POST .../api/deploy \
  -d '{"domain":"old.com","password":"test123"}'

# Should:
# 1. Still work (backward compatibility)
# 2. Validate DNS for old.com (not skipped)
# 3. Return old response format
```

### Proof 6: Site Ideas Actually Used by Claude
```bash
# Deploy with specific ideas:
{ "slug": "proof6", "siteIdeas": "Build a red landing page with animations" }

# Navigate to chat, let Claude respond
# Verify Claude mentions:
- Red color scheme
- Animation suggestions
- Landing page structure
# NOT generic "let's build a website" response
```

### Proof 7: Concurrent Deployments Don't Collide
```bash
# Deploy two sites simultaneously:
curl -X POST .../api/deploy -d '{"slug":"proof7a",...}' &
curl -X POST .../api/deploy -d '{"slug":"proof7b",...}' &
wait

# Verify:
# 1. Both succeed
# 2. Both get different ports
# 3. Both respond at their URLs
# 4. Metadata files separate
```

### Proof 8: Performance Under Load
```bash
# Deploy 10 sites sequentially, measure time:
time for i in {1..10}; do
  curl -X POST .../api/deploy -d "{\"slug\":\"load$i\",...}"
done

# Expect: ~300 seconds total (30s per deploy)
# No exponential slowdown
# Each deploy independent
```

---

## What We're Actually Building (Minimal Cut)

### New Files (3)
1. **`lib/siteMetadataStore.ts`** — 30 lines
   ```typescript
   // Read/write JSON files. That's it.
   // No dependencies, no state, no complexity
   ```

2. **`lib/slug-utils.ts`** — 20 lines
   ```typescript
   // isValidSlug() — regex test
   // isReservedSlug() — Set lookup
   // That's it
   ```

3. **`app/api/sites/metadata/route.ts`** — 40 lines
   ```typescript
   // GET: return JSON from file
   // That's it
   ```

### Modified Files (2)
1. **`app/api/deploy/route.ts`** — 50 lines added
   - Parse `slug` instead of `domain`
   - Build `fullDomain = ${slug}.alive.best`
   - Save metadata after deploy succeeds
   - Return `chatUrl` in response

2. **`app/deploy/page.tsx`** — 40 lines added
   - Input for slug (lowercase, live validation)
   - Textarea for site ideas
   - Show preview: `slug.alive.best`
   - Auto-redirect to `chatUrl` on success

### Chat Enhancement (1 file, 30 lines)
1. **`app/chat/page.tsx`** — useEffect for query params
   - Parse `?slug=X&autoStart=true`
   - Fetch metadata
   - Pre-fill message
   - Trigger send

### Zero Changes Required
- Deploy script (works with any domain)
- Systemd (works with any path)
- Caddy (wildcard already set up)
- Workspace resolution (works for any path)
- System prompt (already takes `additionalContext`)
- Error handling (reuse existing codes)

**Total new code: ~150 lines. Total modified: ~90 lines. Total deleted: 0 lines.**

---

## Risk Assessment (What Could Go Wrong)

| Risk | Probability | Impact | Mitigation |
|------|---|---|---|
| Slug collision check fails | Low | Lose deploy, user retries | File existence check at start, atomic write |
| Metadata file write fails | Low | Chat can't find context | Fall back to empty context, log error |
| Wildcard SSL cert missing | Very Low | Deploy succeeds, HTTPS fails | Verify Caddy config before launch |
| Query param parsing breaks | Very Low | Chat doesn't auto-init | Test in browser console first |
| Slug validation too strict | Low | User frustration | Test with real users, iterate |
| Port exhaustion | Very Low | Deploy fails after 700 sites | Add port monitoring, scale then |

**Mitigation strategy:** Ship with logging. Watch metrics. Fix real problems, not theoretical ones.

---

## Minimal Implementation Order

### Sprint 1 (2 hours, must work end-to-end)
1. Create `siteMetadataStore.ts` (file I/O)
2. Create `slug-utils.ts` (validation)
3. Update deploy API: accept slug, build fullDomain, save metadata
4. Update deploy form: slug input, siteIdeas textarea
5. Create `/api/sites/metadata` endpoint
6. Manual test: deploy → verify metadata file exists

### Sprint 2 (1 hour, chat integration)
1. Update chat page: query param parsing
2. Add metadata fetch
3. Pre-fill initial message
4. Auto-submit
5. Manual test: deploy → redirect → chat initializes

### Sprint 3 (30 min, validation)
1. Run proof tests 1-8 (from above)
2. Fix whatever breaks
3. Done

**Total time: 3.5 hours. Before iteration, before optimization, before anything else.**

---

## What We're NOT Doing (And Why)

❌ **Database** — File storage works. Zero infra, instant queries. When we have 10k sites and file I/O is the bottleneck (it won't be), we'll add a DB. Today? Premature.

❌ **Request queuing** — Deploy ties up a connection for 30 seconds. That's fine. Rate limiting when we see abuse.

❌ **Per-user slug namespacing** — Global slugs simpler. If multi-tenant comes, we check `(user_id, slug)` tuple. Not now.

❌ **Slug expiration/cleanup** — If a site is abandoned, it stays. Delete it manually if needed.

❌ **Admin dashboard** — We don't need to see our sites. Users don't need to manage them yet.

❌ **Password hashing** — Password is ephemeral. Only for authentication, never stored.

❌ **Custom port selection** — Auto-increment from 3333. Done. Users don't choose.

❌ **Graceful rollback** — If deploy fails halfway, filesystem is in inconsistent state. That's okay. Next deploy overwrites it.

---

## Questions for You (Elon's Checklist)

Before we build:

1. **Is the wildcard domain (`*.alive.best`) DNS already confirmed working?**
   - Need: A record set, verified with `dig`
   - Status: ✓ Already confirmed (demo.goalive.nl resolves)

2. **Can the deploy script handle any domain path without modification?**
   - Need: No hardcoded domain assumptions
   - Status: ✓ Takes domain as argument

3. **Is Caddy auto-provisioning wildcard SSL certs?**
   - Need: New subdomains get HTTPS without manual cert intervention
   - Status: ✓ Caddy does this automatically

4. **Do we have write permissions to `/srv/webalive/sites/`?**
   - Need: Deploy script creates directories, we create metadata files
   - Status: ✓ Systemd services run as site users, they can write

5. **Is session/auth working for the deploy endpoint?**
   - Need: Password-gating still required
   - Status: ✓ Existing auth works

6. **Are we okay losing DNS validation for wildcard domains?**
   - Need: Accept that wildcard = trusted, skip DNS checks for it
   - Status: Decision point (suggested: yes)

7. **Can we afford 10k+ deployment directories on disk?**
   - Ballpark: 50MB per site = 500GB for 10k sites
   - Status: Check storage capacity

8. **Do we want to keep the old domain-based deploy format for backward compatibility?**
   - Status: Decision point (suggested: yes, but mark as legacy)

---

## Success Criteria (All or Nothing)

✓ User deploys to subdomain with one form
✓ Site is live at `slug.alive.best` within 30 seconds
✓ Chat opens with site ideas pre-loaded
✓ Claude's response shows it understood the context
✓ Metadata persists (can query API)
✓ Old deploy flow still works
✓ Concurrent deploys don't break
✓ Slug validation prevents collisions

If all 8 are true: **Ship it.**

---

## Real Problem We're Solving

**Before:** User owns domain → configure DNS → wait for propagation → deal with Cloudflare → then deploy

**After:** User clicks slug → deploys → working site

**That's a 10x improvement in time-to-live-website.**

The fact that we do this in 3.5 hours with 150 new lines of code, reusing everything else, with zero new infrastructure? That's the architecture doing its job.

---

## The Decision

This is straightforward. The dependencies exist. The validation is simple. The code is minimal. The risk is low.

**Question:** Do we ship this, or is there something about the premise that's wrong?
