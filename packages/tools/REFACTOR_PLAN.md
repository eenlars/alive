# Template System Refactor Plan

## Goal
Single source of truth: **YAML frontmatter in template .md files**

## Current State Analysis

### Duplication Found

| Field | Frontmatter (.md) | templates.ts | template-ids.ts |
|-------|------------------|--------------|-----------------|
| id | filename | `TEMPLATE_IDS.X` | hardcoded |
| name | ✅ | duplicated | - |
| description | ✅ | duplicated | - |
| category | ✅ `components`/`setup` | duplicated | - |
| complexity | ✅ | duplicated | - |
| files | ✅ | `fileCount` (different name!) | - |
| dependencies | ✅ with versions | without versions | - |
| estimatedTime | ✅ | duplicated | - |
| estimatedTokens | ✅ | duplicated | - |
| tags | ✅ | duplicated | - |
| previewImage | ✅ | duplicated | - |
| available | ✅ | NOT IN (implicit true) | - |
| version | in filename | `TEMPLATE_VERSION_REGISTRY` | hardcoded |

### Code Duplication

```
test/get-template.test.ts:30   → parseFrontmatter() - FULL parser (125 lines)
get-template.ts:47             → isTemplateAvailable() - Simple regex check
apps/web/data/templates.ts     → Hardcoded array duplicating ALL frontmatter
apps/web/data/template-ids.ts  → Hardcoded IDs and version registry
```

## Refactor Steps

### Step 1: Create shared frontmatter parser
**File:** `packages/tools/src/lib/template-frontmatter.ts`

Move `parseFrontmatter()` from test file (it's the complete implementation).

```typescript
export interface TemplateFrontmatter {
  name: string
  description: string
  category: "components" | "setup"  // Only valid categories
  complexity: 1 | 2 | 3
  files: number
  dependencies: string[]  // With versions: "swiper@^11.0.0"
  estimatedTime: string
  estimatedTokens: number
  tags: string[]
  requires: string[]
  previewImage: string
  available: boolean
}

export function parseFrontmatter(content: string): TemplateFrontmatter | null
export function isTemplateAvailable(content: string): boolean
```

### Step 2: Create list-templates function
**File:** `packages/tools/src/tools/templates/list-templates.ts`

```typescript
export interface TemplateListItem {
  id: string              // From filename: "carousel-thumbnails-v1.0.0"
  templateId: string      // Same as id (for UI compatibility)
  name: string
  description: string
  category: "components" | "setup"
  complexity: 1 | 2 | 3
  fileCount: number       // Renamed from 'files' for UI compatibility
  dependencies: string[]
  estimatedTime: string
  estimatedTokens: number
  tags: string[]
  previewImage: string
}

export async function listTemplates(templatesPath?: string): Promise<TemplateListItem[]>
```

**Logic:**
1. Read all subdirectories in templates/
2. Read all .md files in each subdirectory
3. Parse frontmatter from each
4. Filter: `available !== false`
5. Map to TemplateListItem (id from filename)

### Step 3: Update get-template.ts
- Import `parseFrontmatter`, `isTemplateAvailable` from shared lib
- Delete local `isTemplateAvailable()` function

### Step 4: Update test file
- Import `parseFrontmatter` from shared lib
- Delete local copy (125 lines)

### Step 5: Export from package
**File:** `packages/tools/src/index.ts`

```typescript
export { listTemplates, type TemplateListItem } from "./tools/templates/list-templates.js"
export { parseFrontmatter, type TemplateFrontmatter } from "./lib/template-frontmatter.js"
```

### Step 6: Create API endpoint
**File:** `apps/web/app/api/templates/list/route.ts`

```typescript
import { listTemplates } from "@webalive/tools"

export async function GET() {
  const templates = await listTemplates()
  return Response.json({ templates })
}
```

### Step 7: Update SuperTemplatesModal
```typescript
// Before
import { TEMPLATE_CATEGORIES, getTemplatesByCategory, type Template } from "@/data/templates"

// After
const [templates, setTemplates] = useState<TemplateListItem[]>([])
useEffect(() => {
  fetch("/api/templates/list").then(r => r.json()).then(d => setTemplates(d.templates))
}, [])

// Derive categories dynamically
const categories = [...new Set(templates.map(t => t.category))]
```

### Step 8: Delete legacy files
- `apps/web/data/templates.ts`
- `apps/web/data/template-ids.ts`

## Files Summary

### Create
1. `packages/tools/src/lib/template-frontmatter.ts` - Shared parser
2. `packages/tools/src/tools/templates/list-templates.ts` - List function
3. `apps/web/app/api/templates/list/route.ts` - API endpoint

### Modify
1. `packages/tools/src/tools/templates/get-template.ts` - Use shared parser
2. `packages/tools/src/index.ts` - Export new functions
3. `packages/tools/test/get-template.test.ts` - Import shared parser
4. `apps/web/components/modals/SuperTemplatesModal.tsx` - Use API
5. `apps/web/components/ui/SuperTemplateCard.tsx` - Update types
6. `apps/web/components/ui/SuperTemplatePreview.tsx` - Update types
7. `apps/web/components/modals/SuperTemplateConfirmDialog.tsx` - Update types

### Delete
1. `apps/web/data/templates.ts`
2. `apps/web/data/template-ids.ts`

## Field Mapping (UI Compatibility)

| Frontmatter | TemplateListItem | Notes |
|-------------|------------------|-------|
| (filename) | `id`, `templateId` | Both same value for compat |
| `files` | `fileCount` | Renamed for UI compat |
| `dependencies` | `dependencies` | Strip versions for display? |

## Testing Checklist
- [x] `bun run test` passes in packages/tools
- [ ] `bun run test` passes in apps/web
- [ ] SuperTemplatesModal shows all available templates
- [ ] Categories filter works
- [ ] Template preview shows correct data
- [ ] "Use template" triggers correct template ID

## Implementation Complete (2024-12-06)

All 8 steps have been completed:
1. Created `packages/tools/src/lib/template-frontmatter.ts` - Shared parser
2. Created `packages/tools/src/tools/templates/list-templates.ts` - List function
3. Updated `packages/tools/src/tools/templates/get-template.ts` - Uses shared parser
4. Updated `packages/tools/test/get-template.test.ts` - Imports shared parser
5. Updated `packages/tools/src/index.ts` - Exports new functions
6. Created `apps/web/app/api/templates/list/route.ts` - API endpoint
7. Updated UI components to use API:
   - `apps/web/types/templates.ts` - New types file
   - `apps/web/components/modals/SuperTemplatesModal.tsx` - Fetches from API
   - `apps/web/components/ui/SuperTemplateCard.tsx` - Updated imports
   - `apps/web/components/ui/SuperTemplatePreview.tsx` - Updated imports
   - `apps/web/components/modals/SuperTemplateConfirmDialog.tsx` - Updated imports
8. Deleted legacy files:
   - `apps/web/data/templates.ts`
   - `apps/web/data/template-ids.ts`
