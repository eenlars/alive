# How to Add New Alive Super Templates

This guide explains the complete process for adding a new template to the Alive Super Templates system.

## Quick Overview

**Two Systems:**
1. **Backend (MCP Tool)**: Auto-discovers templates in `packages/tools/supertemplate/templates/*/` - no registration needed
2. **Frontend (UI Browser)**: Requires manual registration in 2 files for templates to show in the UI

**If you only add the `.md` file, the template WILL work via tool calls but WON'T appear in the UI browser.**

---

## Step-by-Step Process

### Step 1: Create the Template Markdown File

**Location:** `packages/tools/supertemplate/templates/{category}/{template-name}-v{version}.md`

**Naming convention:**
```
{feature-name}-v{major}.{minor}.{patch}.md
```

**Examples:**
- `carousel-thumbnails-v1.0.0.md`
- `vite-api-plugin-v1.0.0.md`
- `custom-fonts-v1.0.0.md`

**Filesystem Categories (subdirectories):**
- `photo-sliders/` - Image carousels, galleries, lightboxes
- `maps/` - Interactive maps, geocoding, markers
- `forms-and-inputs/` - Upload, validation, multi-step forms
- `backend/` - API servers, databases, backend logic
- `frontend/` - Fonts, styling, client-side setup
- `ui-components/` - Buttons, modals, accordions, UI patterns
- `content-management/` - Blogs, recipes, CMS features

> **Note:** Filesystem categories organize files. UI categories (Components/Setup) are separate and defined in `templates.ts`.

**Template Requirements:**
- Follow ALL items in `TEMPLATE_CHECKLIST.md`
- Include exact metadata block (see checklist)
- 100% copy-paste ready code
- Comprehensive troubleshooting section
- Success criteria for each step

### Step 2: Register the Template ID

**File:** `apps/web/data/template-ids.ts`

**Add to `TEMPLATE_IDS` constant:**
```typescript
export const TEMPLATE_IDS = {
  CAROUSEL_THUMBNAILS: "carousel-thumbnails",
  // ... existing entries
  YOUR_TEMPLATE: "your-template",  // ADD THIS
} as const
```

**Add to `TEMPLATE_VERSION_REGISTRY`:**
```typescript
export const TEMPLATE_VERSION_REGISTRY = {
  [TEMPLATE_IDS.CAROUSEL_THUMBNAILS]: ["v1.0.0"] as const,
  // ... existing entries
  [TEMPLATE_IDS.YOUR_TEMPLATE]: ["v1.0.0"] as const,  // ADD THIS
} as const
```

### Step 3: Add Template Entry to UI Data

**File:** `apps/web/data/templates.ts`

**UI Categories (single source of truth):**
```typescript
export const TEMPLATE_CATEGORIES = {
  components: "Components",  // Visual/interactive UI elements
  setup: "Setup",            // Backend, state, configuration
} as const
```

**Add template entry to `templates` array:**
```typescript
export const templates: Template[] = [
  // COMPONENTS - Visual/interactive UI elements
  {
    id: TEMPLATE_IDS.YOUR_TEMPLATE,
    templateId: versionedId(TEMPLATE_IDS.YOUR_TEMPLATE, "v1.0.0"),
    name: "Your Template Name",
    category: "components",  // or "setup"
    description: "Clear 1-2 sentence description.",
    previewImage: "/templates/previews/placeholder.svg",
    tags: ["react", "your", "tags"],
    complexity: 2,  // 1=Simple, 2=Medium, 3=Complex
    fileCount: 4,
    dependencies: ["package-name"],
    estimatedTime: "5-10 minutes",
    estimatedTokens: 50,
  },
]
```

**Field Guidelines:**
- `id`: Use `TEMPLATE_IDS.{YOUR_TEMPLATE}` constant
- `templateId`: Use `versionedId()` helper
- `category`: "components" (UI elements) or "setup" (config/backend)
- `description`: 1-2 sentences, clear and specific
- `previewImage`: Use placeholder or upload actual preview
- `tags`: 3-5 relevant keywords
- `complexity`: 1 (simple), 2 (medium), 3 (complex)
- `fileCount`: Number of files created
- `dependencies`: Array of npm packages
- `estimatedTime`: Match template's time estimate
- `estimatedTokens`: Rough token count

### Step 4: Verify Everything Works

**Backend (MCP Tool) Test:**
```
// In Claude Code chat:
"Use template: your-template-v1.0.0"

// Claude calls get_alive_super_template and receives the template
```

**Frontend (UI Browser) Test:**
1. Open Claude Code UI
2. Click template browser button
3. Navigate to your category tab
4. Verify template card appears
5. Click card to view preview
6. Click "Use Template" to insert into chat

---

## File Checklist

When adding a new template, you MUST update these files:

- [ ] `packages/tools/supertemplate/templates/{category}/{name}-v{version}.md` - The actual template
- [ ] `apps/web/data/template-ids.ts` - Add to TEMPLATE_IDS and TEMPLATE_VERSION_REGISTRY
- [ ] `apps/web/data/templates.ts` - Add template entry with correct category
- [ ] `packages/tools/supertemplate/README.md` - Update total count (optional)

**You do NOT need to update:**
- ~~SuperTemplatesModal.tsx~~ - Categories auto-derived from `TEMPLATE_CATEGORIES`
- ~~get-template.ts~~ - Auto-discovers templates by filesystem

---

## Common Mistakes

### ❌ Mistake 1: Only Creating the .md File

**Problem:** Template works via tool but doesn't show in UI

**Solution:** Also register in `template-ids.ts` and `templates.ts`

### ❌ Mistake 2: Wrong UI Category

**Problem:** Template shows under wrong tab

**Solution:** Use "components" for UI elements, "setup" for backend/config

### ❌ Mistake 3: Wrong Version Format

**Problem:** Tool can't find template

**Solution:** Filename MUST be `{name}-v{major}.{minor}.{patch}.md`
- ✅ Correct: `vite-api-plugin-v1.0.0.md`
- ❌ Wrong: `vite-api-plugin.md`
- ❌ Wrong: `vite-api-plugin-1.0.0.md`

### ❌ Mistake 4: Invalid Template ID Constant Name

**Problem:** TypeScript errors

**Solution:** Use SCREAMING_SNAKE_CASE:
- ✅ Correct: `VITE_API_PLUGIN: "vite-api-plugin"`
- ❌ Wrong: `viteApiPlugin: "vite-api-plugin"`

---

## Preview Images

**Options:**

1. **Use placeholder** (quickest):
```typescript
previewImage: "/templates/previews/placeholder.svg"
```

2. **Upload to terminal.alive.best** (recommended):
```typescript
previewImage: "https://terminal.alive.best/_images/t/protino.alive.best/o/{hash}/v/orig.webp"
```

3. **Add to public folder**:
```typescript
previewImage: "/templates/previews/your-template.png"
```

---

## Versioning Strategy

**Patch (v1.0.0 → v1.0.1):** Fix typos, clarify instructions
**Minor (v1.0.0 → v1.1.0):** Add optional features, backwards compatible
**Major (v1.0.0 → v2.0.0):** Breaking changes, different architecture

### Adding New Versions

1. Create new file: `{name}-v{new-version}.md`
2. Update `TEMPLATE_VERSION_REGISTRY`:
```typescript
[TEMPLATE_IDS.YOUR_TEMPLATE]: ["v1.0.0", "v1.1.0"] as const,
```
3. Add new entry to `templates` array with new `versionedId`

---

## Testing Checklist

- [ ] Template file passes all TEMPLATE_CHECKLIST.md requirements
- [ ] TypeScript compiles without errors (`bun run type-check`)
- [ ] Template appears in UI browser under correct category
- [ ] "Use Template" inserts correct ID
- [ ] MCP tool successfully retrieves template
- [ ] Followed template myself from scratch (zero-knowledge test)

---

**Last Updated:** 2025-12-05
**Process Version:** 2.0.0
