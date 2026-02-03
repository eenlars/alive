# Tool Workflow: Website Shippable Check

## Scenario
User asks: "Is this ready to ship?" / "Can we launch?" / "Review the website before going live"

Quality gate checklist before a website goes live. Think like Jony Ive - every detail intentional.

---

## ⚠️ STRICT ENFORCEMENT RULES

**READ THIS FIRST. THESE RULES ARE NON-NEGOTIABLE.**

### 1. RUN EVERY SINGLE CHECK
You MUST run ALL grep/glob commands in the Tool Sequence. No skipping. No "I'll check that later". No "that's probably fine". Run them ALL, every time.

### 2. NEVER ASSUME ANYTHING IS "INTENTIONAL"
- ❌ WRONG: "The gradients are intentional CTA blocks"
- ❌ WRONG: "This is part of the design system"
- ❌ WRONG: "The remaining X are probably fine"
- ✅ RIGHT: Report the failure. Let the USER tell you it's intentional.

You are a REPORTER, not an APPROVER. You find issues and report them. The user decides what's intentional.

### 3. REPORT EVERYTHING YOU FIND
If a grep returns results, it's a FAILURE. Report it with file paths and line numbers. Don't make excuses. Don't rationalize. Don't say "but these look intentional".

### 4. NO PASSING WITH CAVEATS
- ❌ WRONG: "Ready to ship! (except for the gradients which are intentional)"
- ❌ WRONG: "Passes the checklist. The remaining issues are minor."
- ✅ RIGHT: "NOT ready to ship. 5 issues found:" [list them all]

### 5. THE USER APPROVES, NOT YOU
Only after reporting ALL failures can the user say "the gradients are intentional, approve them". You NEVER pre-approve anything.

### 6. NEVER READ IMAGE FILES
- ❌ WRONG: `Read("public/og-image.png")` - causes API errors
- ❌ WRONG: `Read("favicon.ico")` - binary files break the API
- ✅ RIGHT: `Glob("**/og-image.*")` - just check if it EXISTS
- ✅ RIGHT: Check HTML for `<meta property="og:image"` reference

For images (png, jpg, ico, svg, webp, gif), ONLY check:
1. File EXISTS (Glob)
2. File is REFERENCED in HTML/meta tags (Grep)

NEVER try to read the actual image content.

---

## Agent Capabilities
- File reading (`Read`)
- Pattern search (`Grep`)
- File listing (`Glob`)
- Codebase check (`check_codebase`)

## Checklist

**EVERY item must PASS or be EXPLICITLY approved by user after you report it as a failure.**

### Visual Quality
- [ ] **No gradients** (unless user explicitly requested them)
- [ ] **No scale animations** (hover effects that scale elements - use opacity/translate instead)
- [ ] **Looks professionally designed** - no generic "AI-generated" aesthetic

### Responsive
- [ ] **Mobile layout works** - actually designed for mobile, not just "doesn't break"
- [ ] **No horizontal scroll** on any viewport
- [ ] **Touch targets 44px+** - buttons and links are tappable

### Typography
- [ ] **Clear hierarchy** - h1 > h2 > h3 > body visually distinct
- [ ] **Readable line length** - 45-75 characters per line
- [ ] **Consistent font weights** - not random 400/500/600 mixing

### Spacing
- [ ] **Consistent spacing system** - not random px values everywhere
- [ ] **Breathing room** - nothing feels cramped
- [ ] **Section spacing intentional** - not all sections identical

### Color & Contrast
- [ ] **Text contrast passes** - 4.5:1 minimum (WCAG)
- [ ] **No pure black on pure white** - too harsh, use near-black/near-white
- [ ] **Intentional color palette** - not default Tailwind blue-500

### Content
- [ ] **No placeholder text** - no "Lorem ipsum", "Your Company Here", "[Replace this]"
- [ ] **No stock photo aesthetic** - images feel real/intentional
- [ ] **Specific CTAs** - not generic "Get Started" / "Learn More"

### States
- [ ] **Hover states exist** - subtle (opacity, color shift, shadow - NOT scale)
- [ ] **Focus states visible** - keyboard users can see what's focused
- [ ] **Loading states** - if async operations, user knows something is happening
- [ ] **Empty states** - if data-driven, what shows when empty?

### Actually Works
- [ ] **Clickable things are semantic** - `<button>` or `<a>`, not `<div onClick>` (keyboard users can't reach divs)
- [ ] **Links have href** - not just `onClick` handlers
- [ ] **Forms have handlers** - `onSubmit` or `action` attribute (not just visual forms)
- [ ] **Images have real src** - no empty `src=""` or placeholder paths
- [ ] **No dead internal links** - href points to routes that exist

### No AI Garbage Left Behind
- [ ] **No console.log** - debug code removed
- [ ] **No alert()** - amateur debugging removed
- [ ] **No localhost URLs** - `localhost:3000`, `127.0.0.1` will break in prod
- [ ] **No empty handlers** - `onClick={() => {}}` or `onChange={() => {}}` do nothing
- [ ] **No TODO/FIXME comments** - unfinished work
- [ ] **No placeholder image services** - `picsum.photos`, `placeholder.com`, `via.placeholder`, `unsplash.it`
- [ ] **No .md files outside /docs** - all markdown goes in `/docs/` except `CLAUDE.md` in root
- [ ] **No emojis in code** - emojis in UI text look unprofessional unless explicitly requested

### Technical
- [ ] **Tailwind connected** - styles actually apply
- [ ] **Favicon exists** - proper favicon or SVG
- [ ] **Title tag updated** - reflects actual website, not "Vite App"
- [ ] **Meta description set** - for search engines
- [ ] **og:image exists** - for social sharing previews
- [ ] **No TypeScript errors** - `check_codebase` passes
- [ ] **404 handled** - page exists or graceful fallback
- [ ] **Buttons have pointer cursor** - enforced globally in CSS (`button { cursor: pointer }`)

### Documentation
- [ ] **CLAUDE.md exists** - in site root
- [ ] **Website idea documented** - clear description of what this site is

### The "Feel" Test
- [ ] **Nothing feels template-y** - could be a real product
- [ ] **Any screenshot looks intentional** - no section looks generic
- [ ] **Animations serve purpose** - guide attention or confirm action, not decoration

## Decision Tree

```
START: User asks if website is shippable
│
├─→ VISUAL QUALITY:
│   ├─→ Grep("bg-gradient|linear-gradient|radial-gradient")
│   │   └─→ Found & not requested: FAIL
│   ├─→ Grep("scale-|hover:scale|transform.*scale")
│   │   └─→ Found: FAIL
│   └─→ Manual review for AI aesthetic
│
├─→ RESPONSIVE:
│   ├─→ Check viewport meta tag exists
│   ├─→ Look for responsive classes (sm:, md:, lg:)
│   └─→ Check for overflow-x-hidden or proper containment
│
├─→ TYPOGRAPHY:
│   ├─→ Grep for heading usage (h1, h2, h3)
│   ├─→ Check for max-w-prose or line length constraints
│   └─→ Look for consistent font-weight usage
│
├─→ SPACING:
│   └─→ Review for spacing system (space-y, gap, consistent margins)
│
├─→ COLOR & CONTRAST:
│   ├─→ Check for #000/#fff pure black/white
│   ├─→ Look for custom color definitions vs default Tailwind
│   └─→ Verify text colors have sufficient contrast
│
├─→ CONTENT:
│   ├─→ Grep("Lorem ipsum|placeholder|Your Company|\\[.*\\]")
│   │   └─→ Found: FAIL
│   └─→ Check CTAs aren't generic
│
├─→ STATES:
│   ├─→ Grep for hover: classes (should exist, shouldn't be scale)
│   ├─→ Grep for focus: classes (accessibility)
│   └─→ Check for loading/empty state handling if data-driven
│
├─→ ACTUALLY WORKS:
│   ├─→ Grep("<div[^>]*onClick|<span[^>]*onClick")
│   │   └─→ Found: FAIL - use <button> or <a> instead
│   ├─→ Grep("<a[^>]*onClick[^>]*(?!href)")
│   │   └─→ Found: FAIL - links need href
│   ├─→ Grep("<form") then check for onSubmit/action
│   │   └─→ Form without handler: FAIL
│   ├─→ Grep('src=""| src="/placeholder|src="placeholder')
│   │   └─→ Found: FAIL - broken images
│   └─→ Extract all href="/..." and verify routes exist
│       └─→ Dead link: FAIL
│
├─→ AI GARBAGE CHECK:
│   ├─→ Grep("console.log") in tsx/jsx
│   │   └─→ Found: FAIL - remove debug code
│   ├─→ Grep("alert\\(") in tsx/jsx
│   │   └─→ Found: FAIL - remove alerts
│   ├─→ Grep("localhost:|127.0.0.1")
│   │   └─→ Found: FAIL - will break in production
│   ├─→ Grep("onClick=\{\\(\\) => \{\}\}|onChange=\{\\(\\) => \{\}\}")
│   │   └─→ Found: FAIL - empty handlers do nothing
│   ├─→ Grep("// TODO|// FIXME|/\\* TODO")
│   │   └─→ Found: FAIL - unfinished work
│   ├─→ Grep("picsum.photos|placeholder.com|via.placeholder|unsplash.it|source.unsplash")
│   │   └─→ Found: FAIL - placeholder images
│   ├─→ Glob("**/*.md") then check location
│   │   └─→ .md outside /docs (except CLAUDE.md): FAIL - move to /docs/
│   └─→ Grep for emoji characters in tsx/jsx files
│       └─→ Found & not requested: FAIL - emojis look unprofessional
│
├─→ TECHNICAL:
│   ├─→ Grep("@tailwind") in CSS files
│   ├─→ Glob("**/favicon*") or Glob("**/icon.*")
│   ├─→ Read index.html/layout.tsx for title
│   ├─→ Check for meta description
│   ├─→ Check for og:image
│   ├─→ check_codebase() for TypeScript errors
│   ├─→ Check 404 handling
│   └─→ Grep("button.*cursor.*pointer|button\\s*{[^}]*cursor") in CSS
│       └─→ Missing: FAIL - buttons need pointer cursor
│
├─→ DOCUMENTATION:
│   ├─→ Read(CLAUDE.md) - must exist
│   └─→ Verify website idea is documented
│
└─→ REPORT:
    ├─→ All PASS: "Ready to ship"
    └─→ Any FAIL: List failures with locations
```

## Tool Sequence

```
1. Grep("bg-gradient|linear-gradient|radial-gradient", glob="**/*.{tsx,jsx,css}")
2. Grep("scale-|hover:scale|transform.*scale", glob="**/*.{tsx,jsx,css}")
3. Grep("Lorem ipsum|placeholder|Your Company|\\[Replace", glob="**/*.{tsx,jsx}")
4. Grep("#000000|#ffffff|#000|#fff", glob="**/*.{tsx,jsx,css}")
5. Grep("<div[^>]*onClick|<span[^>]*onClick", glob="**/*.{tsx,jsx}") → non-semantic clickables
6. Grep('<a[^>]*onClick(?![^>]*href)', glob="**/*.{tsx,jsx}") → links without href
7. Grep("<form", glob="**/*.{tsx,jsx}") then verify onSubmit/action exists
8. Grep('src=""|src="/placeholder|src="placeholder', glob="**/*.{tsx,jsx}") → broken images
9. Grep("console\\.log", glob="**/*.{tsx,jsx}") → debug code
10. Grep("alert\\(", glob="**/*.{tsx,jsx}") → alert debugging
11. Grep("localhost:|127\\.0\\.0\\.1", glob="**/*.{tsx,jsx,ts,js}") → hardcoded localhost
12. Grep("onClick=\\{\\(\\) => \\{\\}\\}", glob="**/*.{tsx,jsx}") → empty handlers
13. Grep("// TODO|// FIXME", glob="**/*.{tsx,jsx,ts}") → unfinished work
14. Grep("picsum\\.photos|placeholder\\.com|via\\.placeholder|unsplash\\.it", glob="**/*.{tsx,jsx}") → placeholder images
15. Glob("**/*.md") → all .md must be in /docs/ (except CLAUDE.md in root)
16. Grep for emoji characters (Unicode ranges) in tsx/jsx files → unprofessional UI text
17. Glob("**/favicon*") + Glob("**/icon.{ico,svg,png}") → CHECK EXISTS ONLY, never Read
18. Glob("**/og-image.*") or Glob("**/og.*") → CHECK EXISTS ONLY, never Read
19. Read(index.html) or Read(src/app/layout.tsx) → title + meta (check og:image is REFERENCED)
20. Grep("@tailwind", glob="**/*.css")
21. Grep("button.*cursor|cursor.*pointer", glob="**/*.css") → pointer on buttons
22. Read(CLAUDE.md)
23. check_codebase()
24. Glob("src/pages/*.tsx") or Read(src/app/) → get routes, verify internal hrefs
```

## Output Format

**Keep it SIMPLE, READABLE, and NON-TECHNICAL.**

The user is not a developer. Don't dump file paths and grep patterns. Just state what's wrong in plain English.

### If issues found:
```
## Not ready to ship

5 things to fix:

1. Found gradients - are these intentional?
2. Buttons don't show pointer cursor on hover
3. Missing og:image for social sharing
4. Found console.log debug code
5. Found emojis in the UI text

Fix these and run the check again.
```

### If all checks pass:
```
## Ready to ship

All checks passed.
```

### Rules
- **Concise** - One line per issue, no explanations
- **Plain English** - "Found gradients" not "Grep matched bg-gradient in src/components/Card.tsx:23"
- **Questions when appropriate** - "Are these gradients intentional?" not "FAIL: gradients detected"
- **No file paths** unless user asks for details
- **No code snippets** in the summary
- **Count issues** at the top
- **Never pass with caveats** - either it passes or it doesn't

## Critical Rules

1. **RUN ALL CHECKS** - Every single grep/glob in Tool Sequence. No exceptions. No skipping.
2. **REPORT, DON'T APPROVE** - You find issues, user decides what's intentional
3. **NO ASSUMPTIONS** - Never say "this looks intentional" or "probably fine"
4. **BE SPECIFIC** - File paths AND line numbers for every issue
5. **NO CAVEATS** - Either it passes or it fails. No "passes except for..."
6. **FAILURES ARE FAILURES** - Gradients found = FAIL. Emojis found = FAIL. Report it.
7. **USER APPROVES** - Only after you report can user say "approve this". Never pre-approve.

## Common Failures

| Issue | Pattern to Find | Fix |
|-------|-----------------|-----|
| Gradients | `bg-gradient-*`, `linear-gradient` | Solid colors |
| Scale hover | `hover:scale-*`, `transform scale` | opacity/translate/shadow |
| Placeholder text | "Lorem", "[Replace]" | Real content |
| Harsh contrast | `#000`, `#fff`, `black`, `white` | `zinc-900`/`zinc-50` |
| Missing favicon | No `favicon.*` or `icon.*` | Add to public/ |
| Template title | "Vite App", "Next.js" | Site name |
| No focus states | Missing `focus:` classes | Add `focus:ring-2` |
| Generic CTAs | "Get Started", "Learn More" | Action-specific text |
| No meta | Missing description/og:image | Add to head |
| No pointer cursor | Buttons missing `cursor: pointer` | Add `button { cursor: pointer }` to global CSS |
| Div with onClick | `<div onClick>`, `<span onClick>` | Use `<button>` or `<a href>` |
| Link without href | `<a onClick>` without href | Add `href` attribute |
| Form without handler | `<form>` without onSubmit/action | Add `onSubmit` handler |
| Empty image src | `src=""`, `src="/placeholder"` | Add real image or remove |
| Dead internal link | `href="/page"` to non-existent route | Fix path or create page |
| console.log | `console.log(` in components | Remove debug code |
| alert() | `alert(` anywhere | Remove amateur debugging |
| localhost URL | `localhost:`, `127.0.0.1` | Use relative URLs or env vars |
| Empty handler | `onClick={() => {}}` | Implement or remove |
| TODO/FIXME | `// TODO`, `// FIXME` | Finish or remove |
| Placeholder images | `picsum.photos`, `placeholder.com` | Use real images |
| .md outside /docs | README.md, NOTES.md in root | Move to /docs/ (only CLAUDE.md in root) |
| Emojis in UI | Emoji characters in text/buttons | Remove unless explicitly requested |

## What Fails the "Feel Test"

❌ **AI-Generated Aesthetic:**
- Gradient blobs as decoration
- Scale-on-hover everywhere
- Purple/blue gradient buttons
- Excessive border-radius (rounded-3xl on everything)
- "Get Started" / "Learn More" buttons
- Generic hero with stock photo
- All sections same spacing
- Emojis in UI text (looks cheap and unpolished)

✓ **Ships Like a Real Product:**
- Intentional color choices
- Hover states that feel considered
- Typography with clear hierarchy
- Content specific to the business
- Animations that guide, not decorate
- Varied section rhythm
- Details that show craft

## Notes

- **5-10 minutes** - Thorough but not exhaustive
- **[?] = manual check** - Can't be automated, flag for user
- **[N/A] = not applicable** - Skip if site doesn't need it

## ⚠️ FINAL REMINDER

**You are an AUDITOR, not a DEFENSE ATTORNEY.**

Your job is to find problems and report them. NOT to explain why problems are okay. NOT to assume the user wanted something. NOT to pass sites that have issues.

If you find yourself typing any of these phrases, STOP and DELETE them:
- "The remaining X are intentional..."
- "This is part of the design system..."
- "These appear to be purposeful..."
- "Passes! (with the exception of...)"
- "Ready to ship, noting that..."

Instead, just report: "FAIL: [issue] found at [file:line]"

Let the USER tell you what's intentional. Your job is to FIND, not to FORGIVE.
