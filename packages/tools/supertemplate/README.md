# Alive Super Templates

High-quality, production-ready templates for common web development patterns. Each template is designed to be actionable, unambiguous, and require zero prior knowledge.

## Directory Structure

```
supertemplate/
├── TEMPLATE_CHECKLIST.md          # Quality standards for all templates
├── README.md                       # This file
└── templates/                      # Template files organized by category
    ├── photo-sliders/              # Image carousels, galleries, lightboxes
    │   └── carousel-thumbnails-v1.0.0.md
    ├── maps/                       # Interactive maps, geocoding, markers
    │   └── map-basic-markers-v1.0.0.md
    ├── forms-and-inputs/           # Upload, validation, multi-step forms
    │   └── upload-image-crop-v1.0.0.md
    ├── backend/                    # API servers, databases, backend logic
    │   └── vite-api-plugin-v1.0.0.md
    ├── content-management/         # Recipe systems, blogs, CMS
    │   └── recipe-system-interactive-v1.0.0.md
    ├── ui-components/              # Buttons, modals, accordions, UI patterns
    │   └── template-browser-v1.0.0.md
    └── landing/                    # Landing page components (hero, backgrounds, CTAs)
        └── hero-background-v1.0.0.md
```

## Template Categories

### Photo Sliders
Image galleries, carousels, and visual content displays.
- Auto-scrolling carousels
- Thumbnail navigation
- Lightbox viewers
- Image grids

### Maps
Interactive maps and location-based features.
- Basic marker maps
- Route planning
- Geocoding
- Custom overlays

### Forms & Inputs
Form components, validation, and file handling.
- Image upload with cropping
- Multi-step forms
- Form validation
- File management

### Backend
API servers, databases, and backend logic.
- Vite API plugins
- Database setup
- REST endpoints
- Authentication

### Content Management
Recipe systems, blogs, and content organization.
- Interactive recipe systems
- Blog CMS
- Content editors
- Tagging and categorization

### UI Components
Reusable interface components and patterns.
- Template browsers
- Modals and dialogs
- Navigation components
- Card layouts

### Landing Pages
Landing page components for startups and marketing sites.
- Interactive hero backgrounds (WebGL, brand-tailored)

## Using Templates

Templates are accessed via the `get_alive_super_template` tool with a versioned ID:

```typescript
// Example: Get carousel template
get_alive_super_template({ id: "carousel-thumbnails-v1.0.0" })
```

The tool automatically searches all categories to find the template - you don't need to specify the category.

## Template Naming Convention

All templates follow semantic versioning:

```
{feature-name}-v{major}.{minor}.{patch}.md
```

**Examples:**
- `carousel-thumbnails-v1.0.0.md`
- `map-basic-markers-v1.2.1.md`
- `blog-cms-system-v2.0.0.md`

## Quality Standards

Every template MUST meet the requirements in `TEMPLATE_CHECKLIST.md`:

- ✅ Zero-knowledge accessibility
- ✅ Actionable & unambiguous steps
- ✅ Complete code blocks (no placeholders)
- ✅ Best practices section
- ✅ Common troubleshooting
- ✅ Dependencies with exact versions
- ✅ TypeScript types and error handling
- ✅ Testing & validation steps

## Adding New Templates

**Complete Guide:** See `ADDING_TEMPLATES.md` for the full step-by-step process.

**Quick steps:**
1. **Create template file** - `templates/{category}/{name}-v{version}.md` following `TEMPLATE_CHECKLIST.md`
2. **Register in 5 files** - template-ids.ts, templates.ts, SuperTemplatesModal.tsx, get-template.ts, README.md
3. **Test both systems** - UI browser AND MCP tool
4. **Verify checklist** - All 49 items from `TEMPLATE_CHECKLIST.md`

**IMPORTANT:** Just creating the `.md` file isn't enough - the template won't show in the UI browser without registration!

## Template Metadata Format

Every template must include this metadata block:

```markdown
# {Template Name}

**Category:** {Category Name}
**Complexity:** {Simple|Medium|Complex}
**Files:** {Number}
**Dependencies:** {List or "None"}
**Estimated Time:** {X-Y minutes}

## Description

{2-3 sentences describing what this builds and why it's useful}
```

## Philosophy

Alive Super Templates are designed to be:

1. **Copy-paste ready** - No modification needed to get started
2. **Production-quality** - Includes error handling, TypeScript, accessibility
3. **Self-contained** - All dependencies and setup steps included
4. **Educational** - Explains why decisions were made
5. **Maintained** - Versioned and updated as best practices evolve

## Contributing

Before adding a new template:

1. Read `TEMPLATE_CHECKLIST.md` completely
2. Check if a similar template already exists
3. Ensure your template meets ALL quality requirements
4. Test with a fresh project (zero prior knowledge test)
5. Document all troubleshooting steps you encountered

---

## Documentation

- `README.md` - This file (overview and usage)
- `TEMPLATE_CHECKLIST.md` - Quality requirements for all templates
- `ADDING_TEMPLATES.md` - Complete guide for adding new templates (includes UI registration)

---

**Last Updated:** 2025-12-07
**Total Templates:** 8
