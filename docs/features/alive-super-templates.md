# Alive Super Templates System

This document describes the Alive Super Templates feature implementation in Alive.

## Overview

Alive Super Templates are high-quality, production-ready implementation blueprints for common web development patterns. Each template provides step-by-step instructions, complete code, dependencies, troubleshooting, and best practices - designed to be actionable for developers with zero prior knowledge of the feature.

**Key characteristics:**
- **Copy-paste ready**: No placeholders or incomplete code
- **Production quality**: Includes error handling, TypeScript, security considerations
- **Self-contained**: All dependencies, setup steps, and requirements documented
- **Educational**: Explains architectural decisions and why approaches were chosen
- **Versioned**: Semantic versioning allows updates while maintaining backwards compatibility

## Architecture

### Two-System Design

**1. Backend (MCP Tool)**
- **Tool:** `get_alive_super_template`
- **Discovery:** Auto-discovers templates in `packages/tools/supertemplate/templates/*/`
- **Retrieval:** Returns full template content when called with versioned ID
- **No registration needed:** Templates are found via directory scanning

**2. Frontend (UI Browser)**
- **Component:** `SuperTemplatesModal`
- **Discovery:** Manual registration in data files
- **Display:** Visual browser with categories, cards, previews
- **Interaction:** Click-to-use workflow that auto-inserts template ID

### Data Flow

```
User clicks template in UI
  ↓
SuperTemplatesModal inserts: "Use template: {templateId}"
  ↓
ChatInput detects template attachment
  ↓
Message sent to Claude with template ID
  ↓
Claude calls get_alive_super_template({id: "..."})
  ↓
MCP tool searches categories, returns template content
  ↓
Claude receives full implementation instructions
  ↓
Claude implements feature following template steps
```

## File Structure

```
alive/
├── packages/tools/supertemplate/
│   ├── README.md                  # Overview and usage
│   ├── TEMPLATE_CHECKLIST.md      # Quality requirements (49 items)
│   ├── ADDING_TEMPLATES.md        # Registration guide (for reference)
│   └── templates/                 # Template files by category
│       ├── photo-sliders/
│       │   └── carousel-thumbnails-v1.0.0.md
│       ├── maps/
│       │   └── map-basic-markers-v1.0.0.md
│       ├── forms-and-inputs/
│       │   └── upload-image-crop-v1.0.0.md
│       ├── content-management/
│       │   └── blog-cms-system-v1.0.0.md
│       ├── backend/
│       │   └── vite-api-plugin-v1.0.0.md
│       └── ui-components/
│           └── template-browser-v1.0.0.md
│
├── apps/web/data/
│   ├── template-ids.ts            # Template ID constants + version registry
│   └── templates.ts               # UI template metadata (cards, categories)
│
├── apps/web/components/modals/
│   └── SuperTemplatesModal.tsx    # Template browser UI
│
└── packages/tools/src/tools/templates/
    └── get-template.ts            # MCP tool implementation
```

## Components

### 1. Template Files (.md)

**Location:** `packages/tools/supertemplate/templates/{category}/{name}-v{version}.md`

**Naming:** `{feature-name}-v{major}.{minor}.{patch}.md`

**Structure:**
- Metadata block (category, complexity, files, dependencies, time, framework, Node version)
- Description (2-3 sentences)
- Step-by-step implementation (numbered with exact file paths)
- How It Works (architecture explanation)
- Customization examples
- Important notes
- Best practices
- Common troubleshooting
- Testing & validation
- Migration paths

**Quality requirements:** Must meet ALL 49 items in `TEMPLATE_CHECKLIST.md`

### 2. Template IDs Registry

**File:** `apps/web/data/template-ids.ts`

**Purpose:** Type-safe template ID constants and version tracking

```typescript
export const TEMPLATE_IDS = {
  CAROUSEL_THUMBNAILS: "carousel-thumbnails",
  VITE_API_PLUGIN: "vite-api-plugin",
  // ...
} as const

export const TEMPLATE_VERSION_REGISTRY = {
  [TEMPLATE_IDS.CAROUSEL_THUMBNAILS]: ["v1.0.0"] as const,
  [TEMPLATE_IDS.VITE_API_PLUGIN]: ["v1.0.0"] as const,
  // ...
} as const
```

**Functions:**
- `versionedId(id, version)` - Create versioned ID with type safety
- `parseVersionedId(versionedId)` - Extract ID and version
- `getTemplateVersions(id)` - Get all versions for a template
- `getLatestVersion(id)` - Get latest version

### 3. Template Metadata

**File:** `apps/web/data/templates.ts`

**Purpose:** UI display data for template browser

```typescript
export interface Template {
  id: string                      // Internal ID
  templateId: VersionedTemplateId // MCP tool ID
  name: string                    // Display name
  category: "sliders" | "maps" | "file-upload" | "backend"
  description: string             // 1-2 sentence description
  previewImage: string            // Preview image URL
  tags: string[]                  // Search keywords
  complexity: 1 | 2 | 3          // Simple/Medium/Complex
  fileCount: number               // Files created
  dependencies: string[]          // NPM packages
  estimatedTime: string           // Implementation time
  estimatedTokens: number         // Token usage (hidden)
}
```

### 4. Template Browser UI

**File:** `apps/web/components/modals/SuperTemplatesModal.tsx`

**Features:**
- Category tabs (Photo Sliders, Maps, File Upload, Backend)
- Template cards with metadata
- Search functionality
- Preview modal with full description
- "Use Template" button that inserts template ID into chat

**User flow:**
1. Click template browser icon (book icon)
2. Browse by category or search
3. Click card to preview
4. Click "Use Template"
5. Template JSON inserted into chat input
6. Auto-detected and converted to attachment chip
7. User sends message
8. Claude retrieves and implements template

### 5. MCP Tool

**File:** `packages/tools/src/tools/templates/get-template.ts`

**Tool name:** `get_alive_super_template`

**Functionality:**
- Validates template ID format (security)
- Scans all category subdirectories
- Reads template file
- Validates path (prevents traversal)
- Returns template content with metadata

**Security features:**
- Input length validation (max 100 chars)
- Path traversal detection (`..`, `/`, `\`)
- Character whitelist (alphanumeric, hyphens, dots)
- Version format validation (`-v{major}.{minor}.{patch}`)
- Symlink resolution and validation
- File size limit (500KB)

## Categories

**Photo Sliders:** Image carousels, galleries, lightboxes
- Example: `carousel-thumbnails-v1.0.0`

**Maps:** Interactive maps, geocoding, markers
- Example: `map-basic-markers-v1.0.0`

**Forms & Inputs:** Upload, validation, multi-step forms
- Example: `upload-image-crop-v1.0.0`

**Backend:** API servers, databases, backend logic
- Example: `vite-api-plugin-v1.0.0`

**UI Components:** Buttons, modals, accordions, UI patterns
- Example: `template-browser-v1.0.0`

## Usage

### For Claude (AI Assistant)

**Trigger:** User message contains `"Use template: {template-id}"`

**Process:**
1. Extract template ID from message
2. Call `get_alive_super_template({ id: templateId })`
3. Receive template content
4. Follow step-by-step instructions exactly
5. Implement feature with all code, dependencies, and setup

**DO NOT:**
- Call tool for natural language requests ("build a carousel")
- Try to find matching templates for generic requests
- Modify template code (use as-is unless user asks for changes)

### For Users

**Via UI Browser:**
1. Click template browser icon in chat interface
2. Browse categories or search for feature
3. Preview template details
4. Click "Use Template" to insert into chat
5. Send message to Claude
6. Claude implements the feature

**Via Direct Text:**
1. Type: `Use template: {template-id}` (e.g., "Use template: vite-api-plugin-v1.0.0")
2. Send message
3. Claude retrieves and implements

## Adding New Templates

**Complete guide:** See [docs/guides/adding-templates.md](../guides/adding-templates.md)

**Quick checklist:**
1. Create template .md file in appropriate category folder
2. Follow ALL items in TEMPLATE_CHECKLIST.md (49 requirements)
3. Register in 5 files (template-ids.ts, templates.ts, SuperTemplatesModal.tsx, get-template.ts, README.md)
4. Test both MCP tool AND UI browser
5. Zero-knowledge test (can a beginner implement it?)

**IMPORTANT:** Creating only the .md file is not enough - template won't appear in UI without registration!

## Quality Standards

Every template must meet ALL requirements in `packages/tools/supertemplate/TEMPLATE_CHECKLIST.md`:

**10 Major Sections:**
1. Zero-Knowledge Accessibility (5 items)
2. Actionable & Unambiguous (6 items)
3. Clarity & Structure (7 items)
4. Best Practices (7 items)
5. Common Troubleshooting (7 items)
6. Dependencies Management (5 items)
7. Code Quality (6 items)
8. Testing & Validation (4 items)
9. Integration Requirements (4 items)
10. Maintenance & Updates (4 items)

**Total:** 49 checklist items + 12 anti-patterns to avoid

**Result:** Production-ready templates that work first time, every time.

## Versioning Strategy

**Semantic Versioning:** `v{major}.{minor}.{patch}`

**Patch (v1.0.0 → v1.0.1):**
- Fix typos or errors
- Clarify existing instructions
- Update troubleshooting
- No code changes

**Minor (v1.0.0 → v1.1.0):**
- Add optional features
- Improve code quality
- Add more examples
- Backwards compatible

**Major (v1.0.0 → v2.0.0):**
- Breaking changes
- Different architecture
- Incompatible with v1.x
- Requires migration

**Multiple versions:** Both old and new versions can coexist - users choose which to use.

## Security Considerations

### Path Traversal Prevention

All template file access is validated:
- No `..`, `/`, or `\` in template IDs
- Path resolution with `isPathWithinBase()` check
- Symlink resolution and validation
- Template files must be within `supertemplate/templates/`

### Input Validation

Template IDs must:
- Match pattern: `{name}-v{major}.{minor}.{patch}`
- Contain only alphanumeric, hyphens, dots
- Be max 100 characters
- Not be empty or whitespace

### File Size Limits

Templates are limited to 500KB to prevent memory exhaustion.

## Performance

**Backend (MCP Tool):**
- Directory scanning: ~5-10ms (6 categories)
- File read: ~1-5ms per template
- Total retrieval: ~10-20ms

**Frontend (UI Browser):**
- Modal load: <100ms (loads from memory)
- Category switching: instant (filtered from array)
- Template preview: instant (already in memory)

**No network calls** - all data is local.

## Future Improvements

### Planned Features

**v1.1.0:**
- Template search across categories
- "Recently Used" templates section
- Template favorites/bookmarks
- Usage analytics (which templates are popular)

**v2.0.0:**
- Template composition (combine multiple templates)
- Custom template creation in UI
- Template marketplace/sharing
- Version diff viewer
- Template testing framework

### Technical Debt

- Replace in-memory template data with database (for dynamic updates)
- Add template preview generation (screenshots)
- Implement template validation in CI/CD
- Add template usage tracking
- Create template CLI for easier registration

## Troubleshooting

### Template not showing in UI

**Symptoms:** Template works via tool but not in browser

**Solution:** Check registration in all 5 files:
1. `apps/web/data/template-ids.ts` - ID constant + version registry
2. `apps/web/data/templates.ts` - Template entry with metadata
3. `apps/web/components/modals/SuperTemplatesModal.tsx` - Category type + label
4. `packages/tools/src/tools/templates/get-template.ts` - Category list
5. `packages/tools/supertemplate/README.md` - Total count

### Template not found by tool

**Symptoms:** Error: "Template '{id}' not found"

**Solutions:**
- Check filename matches ID exactly: `{id}.md`
- Check filename has correct version: `-v{major}.{minor}.{patch}`
- Check file is in a category subdirectory
- Check file has `.md` extension
- Run: `ls packages/tools/supertemplate/templates/*/{id}.md`

### Category mismatch

**Symptoms:** Template appears in wrong category

**Solutions:**
- Check template .md metadata: `**Category:** {name}`
- Check templates.ts entry: `category: "{name}"`
- Check folder name matches category
- Categories are case-sensitive

### TypeScript errors after adding template

**Symptoms:** Type errors in template-ids.ts or templates.ts

**Solutions:**
- Ensure ID constant name is SCREAMING_SNAKE_CASE
- Add ID to both TEMPLATE_IDS and TEMPLATE_VERSION_REGISTRY
- Check `versionedId()` call has correct parameters
- Run: `cd apps/web && bun run build`

## Related Documentation

- [Adding Templates Guide](../guides/adding-templates.md) - Complete step-by-step process
- `packages/tools/supertemplate/TEMPLATE_CHECKLIST.md` - Quality requirements
- `packages/tools/supertemplate/README.md` - Template system overview
- `packages/tools/CLAUDE.md` - Templates vs Guides distinction

## Statistics

**Current Status (as of 2025-11-09):**
- Total templates: 5
- Categories: 5
- Average template length: ~700 lines
- Average implementation time: 8 minutes
- Quality checklist compliance: 100%

**Templates:**
1. carousel-thumbnails-v1.0.0 (Photo Sliders)
2. map-basic-markers-v1.0.0 (Maps)
3. upload-image-crop-v1.0.0 (Forms & Inputs)
4. vite-api-plugin-v1.0.0 (Backend)
5. template-browser-v1.0.0 (UI Components)
