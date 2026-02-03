# Alive Super Template Quality Checklist

This checklist defines the strict requirements that every Alive Super Template MUST fulfill before being published.

## ✅ Template Quality Requirements

### 1. Zero-Knowledge Accessibility
- [ ] **No assumed prior knowledge** - Template explains every concept it introduces
- [ ] **All dependencies listed** - Package names, versions, and installation commands provided
- [ ] **External services documented** - API keys, setup steps, account requirements clearly stated
- [ ] **Environment setup included** - Environment variables, configuration files, setup scripts
- [ ] **Prerequisite steps clear** - What must exist before starting (e.g., "requires Next.js project")

### 2. Actionable & Unambiguous
- [ ] **Step-by-step implementation** - Numbered steps in logical order
- [ ] **Exact file paths** - Full paths specified (e.g., `components/Carousel.tsx`, not "create a component")
- [ ] **Complete code blocks** - No placeholders like `// your code here` or `...`
- [ ] **Clear success criteria** - How to verify each step worked
- [ ] **Copy-paste ready** - Code can be used directly without modification
- [ ] **No multiple choices** - One clear path, not "you can use X or Y"

### 3. Clarity & Structure
- [ ] **Clear title** - Describes what will be built
- [ ] **Category specified** - Template belongs to a defined category
- [ ] **Complexity level** - Marked as Simple/Medium/Complex
- [ ] **Time estimate** - Realistic implementation time provided
- [ ] **Files count** - Number of files to be created listed
- [ ] **Description paragraph** - 2-3 sentences explaining what this builds and why
- [ ] **Visual example** - Description of what the end result looks like/does

### 4. Best Practices Section
- [ ] **Architecture explanation** - Why this approach was chosen
- [ ] **Security considerations** - Potential vulnerabilities and how they're addressed
- [ ] **Performance notes** - Optimization techniques applied
- [ ] **Accessibility** - ARIA labels, keyboard navigation, screen reader support
- [ ] **Responsive design** - Mobile, tablet, desktop considerations
- [ ] **Code organization** - Why files are structured this way
- [ ] **Alternative approaches** - Why other methods were NOT chosen

### 5. Common Troubleshooting
- [ ] **Installation issues** - Package manager errors, version conflicts
- [ ] **Build/compile errors** - TypeScript errors, import issues
- [ ] **Runtime errors** - Common mistakes and their fixes
- [ ] **Integration problems** - Conflicts with existing code
- [ ] **Browser compatibility** - Known issues with specific browsers
- [ ] **Environment issues** - Node version, missing env vars
- [ ] **Visual bugs** - Styling issues, layout breaks

### 6. Dependencies Management
- [ ] **Exact versions** - Package versions specified (not `latest` or `^1.0.0`)
- [ ] **Installation command** - Complete npm/bun/pnpm install command
- [ ] **Peer dependencies** - All required peer deps listed
- [ ] **Optional dependencies** - Clearly marked as optional with use cases
- [ ] **Dev dependencies** - Separated from runtime dependencies

### 7. Code Quality
- [ ] **TypeScript types** - Full type safety, no `any` types
- [ ] **Error handling** - Try-catch blocks, error boundaries, fallbacks
- [ ] **Loading states** - Skeleton screens, spinners, placeholder content
- [ ] **Empty states** - What shows when no data
- [ ] **Comments** - Complex logic explained inline
- [ ] **Naming conventions** - Consistent, descriptive variable/function names

### 8. Testing & Validation
- [ ] **Manual testing steps** - How to verify it works
- [ ] **Edge cases covered** - Empty data, large datasets, network failures
- [ ] **Example data** - Sample data structure provided
- [ ] **Visual testing** - Screenshots or descriptions of expected output

### 9. Integration Requirements
- [ ] **Framework compatibility** - Explicitly states which frameworks (Next.js, React, etc.)
- [ ] **Minimum versions** - Node.js, framework versions required
- [ ] **Conflicting patterns** - Known incompatibilities with common setups
- [ ] **Migration path** - If replacing existing code, how to migrate

### 10. Maintenance & Updates
- [ ] **Version number** - Follows semantic versioning (v1.0.0, v1.1.0, etc.)
- [ ] **Changelog section** - If updating existing template
- [ ] **Deprecation notices** - If replacing older patterns
- [ ] **Future improvements** - Known limitations or planned enhancements

---

## 🚫 Template Anti-Patterns (Must Avoid)

- ❌ Vague instructions ("add some styling", "configure as needed")
- ❌ Missing error handling
- ❌ Assumed knowledge ("as you know", "obviously")
- ❌ Incomplete code snippets
- ❌ Multiple implementation paths without clear recommendation
- ❌ Missing file extensions or ambiguous paths
- ❌ Copy-pasted code without explanation
- ❌ No troubleshooting section
- ❌ Outdated dependencies or deprecated patterns
- ❌ Missing TypeScript types
- ❌ No accessibility considerations
- ❌ No mobile responsiveness

---

## 📋 Template Metadata Format

Every template must start with this exact metadata block:

```markdown
# {Template Name}

**Category:** {Category Name}
**Complexity:** {Simple|Medium|Complex}
**Files:** {Number}
**Dependencies:** {List or "None"}
**Estimated Time:** {X-Y minutes}
**Framework:** {Next.js|React|Vue|etc.}
**Min Node Version:** {e.g., 18.0.0}

## Description

{2-3 sentences describing what this builds and why it's useful}
```

---

## ✨ Review Process

Before publishing a template:

1. **Self-review** - Go through this checklist item by item
2. **Fresh eyes test** - Have someone unfamiliar implement it
3. **Zero-knowledge test** - Can a beginner follow it without asking questions?
4. **Break test** - Try to break it by skipping steps or using edge cases
5. **Time validation** - Does implementation match estimated time?

---

## 📚 Template Categories

Organized by feature type:

- **UI Components** - Buttons, modals, carousels, accordions
- **Photo Sliders** - Image galleries, carousels, lightboxes
- **Forms & Inputs** - Upload, validation, multi-step forms
- **Maps & Location** - Interactive maps, geocoding, markers
- **Data Display** - Tables, charts, dashboards
- **Content Management** - Blogs, CMS, editors
- **Authentication** - Login, signup, OAuth flows
- **Payment** - Stripe, payment forms, checkout
- **Search** - Full-text search, filters, autocomplete
- **Real-time** - WebSockets, SSE, live updates

---

**Last Updated:** 2025-11-09
**Version:** 1.0.0
