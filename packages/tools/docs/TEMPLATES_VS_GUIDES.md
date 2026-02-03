# Templates vs Guides: A Clear Distinction

This document explains the difference between **Templates** and **Guides** in the tools package, why they exist, and when to use each.

## The Core Difference

### Templates
Templates are **step-by-step implementation blueprints** for building specific features.

**Templates answer the question**: "How do I build this feature?"

### Guides
Guides are **general knowledge and best practices** on various development topics.

**Guides answer the question**: "How should I think about this topic?"

## Quick Reference

| Aspect | Templates | Guides |
|--------|-----------|--------|
| **Purpose** | Build a specific feature | Learn best practices |
| **Scope** | Feature-focused and complete | Topic-focused and general |
| **Content** | Files, code patterns, architecture | Concepts, patterns, advice |
| **Tool** | `get_template` | `list_guides`, `get_guide` |
| **Location** | `internals-folder/templates/` | `internals-folder/` categories |
| **Naming** | `feature-name-v1.0.0.md` | `topic-name.md` |
| **When Used** | "Build a carousel" | "Best practices for state" |

## Templates in Detail

### What Templates Are
- **Ready-to-build instructions** with all details needed to implement a feature
- **Self-contained** - include file structure, requirements, code patterns, dependencies
- **Versioned** - follow semantic versioning (v1.0.0, v2.1.0, etc.)
- **Feature-specific** - each template describes one concrete feature

### Template Contents
A template file typically includes:

```markdown
# Feature Name

**Category:** Category name
**Complexity:** Simple/Medium/Complex
**Files:** Number of files to create
**Dependencies:** List of packages needed
**Estimated Time:** X-Y minutes

## Description
What this feature does and when to use it.

## Implementation
Detailed instructions including:
- Files to create (with purposes)
- Key architecture (how it works)
- Requirements (detailed specifications)
- Code examples and patterns
- Installation instructions
```

### Examples of Templates
- `carousel-thumbnails-v1.0.0.md` - Auto-scrolling carousel component
- `map-basic-markers-v1.0.0.md` - Interactive Leaflet map
- `upload-image-crop-v1.0.0.md` - File upload with image cropping
- `blog-cms-system-v1.0.0.md` - Complete blog CMS

### When to Create a Template
Create a template when you have a **specific, concrete feature** to implement:
- "I want a carousel component"
- "I need file upload with crop"
- "I'm building a blog CMS"
- "I need an interactive map"

The key: You're describing a **concrete thing to build with exact specifications**.

### Using Templates
When Claude uses a template, it retrieves the complete blueprint and builds exactly what's described - no guessing, no clarification needed.

```typescript
// User says: "Build an auto-scrolling carousel"
// Claude retrieves: carousel-thumbnails-v1.0.0.md
// Claude builds: Exactly what the template describes
```

## Guides in Detail

### What Guides Are
- **Educational material** on development topics
- **General knowledge** applicable across many projects
- **Best practices and patterns** for common situations
- **Topic-focused** rather than feature-focused

### Guide Contents
Guides cover topics like:
- Component organization patterns
- State management approaches
- Security best practices
- Performance optimization
- Error handling strategies
- Code structure and naming conventions
- API design principles
- Testing strategies

### Examples of Guides
- "React component organization patterns"
- "State management considerations"
- "Security hardening checklist"
- "Performance optimization tips"
- "Error handling strategies"

### When to Create a Guide
Create a guide when you have **general knowledge** to share:
- "Here's how to structure React components"
- "Here are security best practices"
- "Here's how to optimize bundle size"
- "Here's how to think about state management"

The key: You're sharing **knowledge and patterns**, not implementing a specific feature.

### Using Guides
When Claude uses a guide, it gains knowledge to apply contextually across multiple projects.

```typescript
// User asks: "What's the best way to organize components?"
// Claude retrieves: Component organization guide
// Claude applies: The patterns learned to the current project
```

## Decision Tree

Use this tree to determine what to create:

```
Do you have a specific feature to build?
├─ YES → This is a TEMPLATE
│  Example: "Auto-scrolling carousel component"
│  Create: internals-folder/templates/carousel-thumbnails-v1.0.0.md
│
└─ NO → Is this general knowledge/patterns?
   ├─ YES → This is a GUIDE
   │  Example: "How to structure React components"
   │  Create: internals-folder/[category]/component-organization.md
   │
   └─ NO → Don't create (consult with team)
```

## File Organization

### Templates
Location: `/internals-folder/templates/`

Naming convention: `feature-name-v{MAJOR}.{MINOR}.{PATCH}.md`

Examples:
- `carousel-thumbnails-v1.0.0.md`
- `map-basic-markers-v1.0.0.md`
- `upload-image-crop-v2.1.0.md` (version 2.1.0)

### Guides
Location: `/internals-folder/{category}/`

Naming convention: `topic-name.md` (no versioning)

Examples:
- `/internals-folder/30-guides/component-organization.md`
- `/internals-folder/30-guides/state-management.md`
- `/internals-folder/40-architecture/error-handling.md`

## Important Notes

### Templates
- ✅ Include exact file paths and structure
- ✅ Provide complete code patterns
- ✅ Specify all dependencies
- ✅ Be detailed and actionable
- ❌ Don't just explain concepts
- ❌ Don't be generic

### Guides
- ✅ Share knowledge and patterns
- ✅ Provide context and reasoning
- ✅ Give examples (multiple if helpful)
- ✅ Be general and reusable
- ❌ Don't prescribe specific file structures
- ❌ Don't be implementation-specific

## Examples

### Template Example: Auto-Scrolling Carousel

This IS a template because it's a concrete feature:

```markdown
# Auto-Scrolling Carousel

**Category:** Photo Sliders
**Files:** 1
**Dependencies:** None
**Estimated Time:** 4-5 minutes

## Description
Smooth auto-scrolling carousel that continuously moves images...

## Implementation

Create a smooth moving carousel:

### Files to create:
- `components/MovingCarousel.tsx` - Auto-scrolling carousel

### Key Architecture:
- Use CSS transform: translateX() for smooth scrolling
- Use setInterval (50ms) for animation updates
- Duplicate images 3x for seamless loop

### Requirements:
- Automatic scrolling on component mount
- Continuous motion (never stops)
- Each slide 55vw wide...
```

### Guide Example: Component Organization

This is a GUIDE, not a template:

```markdown
# React Component Organization Patterns

## Overview
This guide covers best practices for organizing React components...

## Patterns

### Pattern 1: Feature-Based Organization
Organize by feature/domain rather than type...

### Pattern 2: Container/Presentational Pattern
Separate container logic from presentation...

## Trade-offs
- Feature-based: Easier to find related code
- Type-based: Easier to reuse across features

## When to Use Each
Use feature-based for...
Use type-based for...
```

## FAQ

**Q: Can a template reference a guide?**
A: Yes! A template can say "follow the component organization guide" for general structure, then provide specific implementation details.

**Q: Should all features have templates?**
A: No. Only create templates for features that will be built from scratch multiple times or that benefit from detailed step-by-step instructions.

**Q: Can guides become templates?**
A: Yes. If you notice people always ask for the same specific feature, write a template to simplify their work.

**Q: What about feature variations?**
A: Create separate template versions: `carousel-basic-v1.0.0.md` and `carousel-advanced-v1.0.0.md`

**Q: How detailed should templates be?**
A: Detailed enough that Claude can build it without asking clarifying questions. Include all architectural decisions, file paths, and code patterns.

## Related Documentation

- [README.md](../README.md) - Tool overview and API reference
- [CLAUDE.md](../CLAUDE.md) - Guidelines for working on this package
