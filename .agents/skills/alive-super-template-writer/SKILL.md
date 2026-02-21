---
name: Alive Super Template Writer
description: Write high-quality Alive Super Templates for features with 0-knowledge clarity and proper dependency management. Templates are self-contained, copy-paste-ready implementation guides.
---

## Where Templates Live (CRITICAL)

**Templates go here:**
```
/root/alive/packages/tools/internals-folder/templates/
```

**File naming convention:**
```
{feature-name}-v{major}.{minor}.{patch}.md

Examples:
- carousel-thumbnails-v1.0.0.md
- map-basic-markers-v1.0.0.md
- blog-cms-system-v1.0.0.md
```

**Version Rules:**
- Start at `v1.0.0` for new templates
- Increment PATCH (1.0.0 → 1.0.1) for small fixes/clarifications
- Increment MINOR (1.0.0 → 1.1.0) for new features/customizations added
- Increment MAJOR (1.0.0 → 2.0.0) for breaking changes in approach

**NEVER:**
- ❌ Put templates in the guides folder (`30-guides/`)
- ❌ Use templates in any folder besides `templates/`
- ❌ Mix templates with guides (they are fundamentally different)

---

## Core Principle: 0-Knowledge Clarity

Templates are for **someone with zero knowledge** of the feature. They must be able to follow your template and have it **actually work** on the first try.

### What "0-Knowledge" Means

- No assumptions about prior experience
- Every step is explicit and numbered
- All required code is shown in full (copy-paste ready)
- No "see the guide for details" - everything is self-contained
- Common pitfalls are explained
- Examples are concrete, not abstract

---

## Template Structure

Every template should follow this exact pattern:

```markdown
# [Feature Name]

**Category:** [category]
**Complexity:** [1-3]
**Files:** [number]
**Dependencies:** [list or "None"]
**Estimated Time:** [realistic time]

## Description

[1-2 sentence description of what you're building]

## Step-by-Step Implementation

### Step 1: [Action]

[Explanation of what this step does and why]

[Code/commands to copy]

### Step 2: [Action]

[Continue...]

## How It Works

- **Section 1**: Explain key concept
- **Section 2**: Explain key concept
- **etc.**

## Customization Examples

Show 2-3 concrete examples of how to modify the feature.

## Important Notes

- Critical things to avoid or remember
- Common mistakes
- Why you're doing things this way (not some other way)

Ready to implement this template
```

---

## Templates vs Guides (CRITICAL DISTINCTION)

**Templates** and **Guides** are completely different. Do NOT confuse them.

### Templates
- **Purpose**: Step-by-step implementation blueprints for specific features
- **Content**: Exact file structure, complete code, requirements, architecture
- **Use When**: Building a concrete feature (carousel, map, file upload, blog)
- **Location**: `packages/tools/internals-folder/templates/`
- **Format**: `feature-name-v1.0.0.md`
- **Goal**: Someone follows it and has a working feature

### Guides
- **Purpose**: General development patterns, best practices, reference material
- **Content**: Knowledge about architecture, security, performance, organization
- **Use When**: Learning concepts, design patterns, general best practices
- **Location**: `packages/tools/internals-folder/30-guides/` or other category folders
- **Format**: Descriptive markdown files
- **Goal**: Someone learns a pattern and applies it themselves

### Key Rule: NEVER Mix Them

❌ **WRONG:**
```
Put an implementation template in the guides folder
"See the guide for the complete code"
Reference guides inside templates
```

✅ **CORRECT:**
```
Template in templates/ folder with COMPLETE code
Guide in 30-guides/ folder with CONCEPTS
Keep them separate - templates are self-contained
```

**Example Relationship:**
- Template: `map-basic-markers-v1.0.0.md` (step-by-step implementation)
- Guide: `09-leaflet-map-integration.md` (advanced patterns, concepts, best practices)

A template is **actionable**. A guide is **educational**.

---

## Critical Rules

### 1. Complete Code, Every Time

❌ **DON'T:**
```
Create a component with the following features:
- Show a map
- Add markers
- etc.
```

✅ **DO:**
```tsx
Create `src/components/MyMap.tsx`:

\`\`\`tsx
import { useEffect, useRef } from 'react';
import L from 'leaflet';

export const MyMap = () => {
  const mapRef = useRef<HTMLDivElement>(null);
  // ... full working code
  return <div ref={mapRef} className="h-96 w-full" />;
};
\`\`\`
```

### 2. Which Files to Edit (Directory Conventions)

Templates guide users to edit files in the **template's user directory structure**:

```
user/
├── src/
│   ├── components/        ← Components go here
│   ├── pages/            ← Page components go here
│   ├── lib/              ← Utilities, helpers, types
│   ├── hooks/            ← Custom React hooks
│   └── index.css         ← Global styles (rarely edit)
├── package.json          ← DO NOT edit (already set up)
├── vite.config.ts        ← DO NOT edit (already set up)
├── tsconfig.json         ← DO NOT edit (already set up)
└── index.html            ← DO NOT edit (entry point only)
```

**When writing steps:**

✅ **DO:**
```
Create `src/components/InteractiveMap.tsx`:
```

✅ **DO:**
```
Update `src/pages/Index.tsx`:
```

❌ **DON'T:**
```
Create a new file in the root directory
Modify package.json
Edit vite.config.ts
```

**Key Convention:**
- Components always go in `src/components/`
- Pages always go in `src/pages/`
- Utilities/types go in `src/lib/`
- Hooks go in `src/hooks/`
- Config files are off-limits (already optimized)
- `package.json` is managed - only mention existing deps

### 3. Package Installation (ONLY When Necessary)

**DON'T assume packages are pre-installed.**

Check the template's `package.json` first:

❌ **WRONG:**
```bash
npm install leaflet react-leaflet @types/leaflet
```

✅ **CORRECT APPROACH:**

1. Check if package exists: `grep -E "leaflet|react-leaflet" /root/alive/packages/template/user/package.json`
2. If NOT found, THEN add it:
   ```bash
   bun add leaflet @types/leaflet
   ```
3. If already exists, mention: "Already included in your template's dependencies"

**When to use the package tool:**
- Only add NEW packages not in template's `package.json`
- Always use `bun add` (not `npm install`)
- For dev dependencies, use `bun add -D`
- Document which packages are NEW vs. already included

### 4. Example Data is Concrete

❌ **WRONG:**
```tsx
const locations = [
  // Add your locations here
];
```

✅ **CORRECT:**
```tsx
const locations = [
  {
    id: 1,
    lat: 51.5074,
    lon: -0.1278,
    name: 'London',
    description: 'Capital of the United Kingdom',
  },
  {
    id: 2,
    lat: 48.8566,
    lon: 2.3522,
    name: 'Paris',
    description: 'Capital of France',
  },
];
```

Someone can copy-paste this and see it working **immediately**.

### 5. Explain the "Why"

For each significant section, explain **why** you're doing it this way:

```tsx
// Fix for default marker icons in bundled apps
// Leaflet expects marker icons to load from URLs, but in bundled React apps,
// these images need to be imported and re-configured
import markerIcon from 'leaflet/dist/images/marker-icon.png';
// ...
```

### 6. Address Common Mistakes

Every template needs an "Important Notes" or "Common Pitfalls" section:

```markdown
## Important Notes

- **Do NOT use react-leaflet**: It has React 18 compatibility issues.
  This vanilla Leaflet approach is more reliable.
- **Always import the CSS**: `import 'leaflet/dist/leaflet.css'` is required
  for the map to render correctly.
- **Set explicit height**: The map container needs a defined height
  (CSS or inline style), or it won't show.
```

### 7. Show "How It Works"

Don't just show code - explain what's happening:

```markdown
## How It Works

1. **Marker Icon Fix**: Leaflet's default marker icons don't load in bundled
   apps, so we import the actual PNG files and reconfigure Leaflet to use them.

2. **Map Instance**: Uses `mapInstanceRef` to persist the map instance across
   re-renders (crucial for performance).

3. **Marker Management**: When locations change, it clears all existing markers
   and adds new ones.

4. **Cleanup**: When the component unmounts, the map instance is properly disposed.
```

### 8. Customization Examples (Not Optional)

Show at least 2-3 ways to customize the feature:

```markdown
## Customization Examples

### Change Map Tiles (Dark Mode)
\`\`\`tsx
// Replace the L.tileLayer call with:
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '© OpenStreetMap, © CartoDB',
  maxZoom: 19,
}).addTo(map);
\`\`\`

### Add Zoom Controls
\`\`\`tsx
// After creating the map:
L.control.zoom({ position: 'bottomright' }).addTo(map);
\`\`\`
```

---

## Checklist: Before You Say "Ready to Implement"

- [ ] Someone with zero knowledge could follow every step
- [ ] All code blocks are complete and functional (no `// ...` placeholders)
- [ ] Each step explains WHY, not just WHAT
- [ ] File names and paths are exact
- [ ] Example data is concrete (not `// add your data here`)
- [ ] New dependencies are listed explicitly and checked against template
- [ ] "How It Works" section explains key concepts
- [ ] At least 2-3 customization examples are shown
- [ ] Common mistakes/pitfalls are documented
- [ ] Template ends with "Ready to implement this template"
- [ ] No references to external guides (everything self-contained)
- [ ] For packages: Used correct tool if adding to `package.json`

---

## When Creating a Template

1. **Research existing similar templates** - Don't reinvent the wheel
2. **Check the guide folder** - There might be a related guide in `30-guides/`
3. **Test the code** - If possible, test the full flow yourself
4. **Be specific** - "Interactive Map" is better than "Map Component"
5. **Set realistic time estimates** - Factor in reading time
6. **Document gotchas** - React 18 issues, marker icons, etc.

---

## Example: Good vs Bad Templates

### ❌ Bad Template
```
# Todo List

Create a todo list component with:
- Add todos
- Mark complete
- Delete todos

Use React hooks and Tailwind CSS.
```

### ✅ Good Template
```
# Todo List with Persistence

**Files:** 2
**Dependencies:** None (localStorage built-in)
**Estimated Time:** 5-7 minutes

## Description
A todo list where items persist in browser storage even after refresh.

## Step-by-Step Implementation

### Step 1: Create the Todo Component

Create `src/components/TodoList.tsx`:

\`\`\`tsx
import { useState, useEffect } from 'react';

export const TodoList = () => {
  const [todos, setTodos] = useState<{id: number; text: string; done: boolean}[]>([]);
  const [input, setInput] = useState('');

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('todos');
    if (saved) setTodos(JSON.parse(saved));
  }, []);

  // Save to localStorage whenever todos change
  useEffect(() => {
    localStorage.setItem('todos', JSON.stringify(todos));
  }, [todos]);

  const addTodo = () => {
    if (!input.trim()) return;
    setTodos([...todos, { id: Date.now(), text: input, done: false }]);
    setInput('');
  };

  // ... full component code
};
\`\`\`

### Step 2: Use in Your Page

Update `src/pages/Index.tsx`:

\`\`\`tsx
import { TodoList } from '../components/TodoList';

const Index = () => {
  return (
    <div className="p-8">
      <h1>My Todos</h1>
      <TodoList />
    </div>
  );
};

export default Index;
\`\`\`

## How It Works

1. **Initial Load**: `useEffect` loads todos from `localStorage` when component mounts
2. **Auto-Save**: Another `useEffect` saves todos whenever the array changes
3. **localStorage**: Browser's built-in key-value storage that persists across page refreshes

## Important Notes

- No external database needed
- Data persists only in that browser (doesn't sync across devices)
- Clear browser data will delete todos

Ready to implement this template
```

---

## Your Mission

When writing a template:

**Someone unfamiliar with the technology should be able to:**
1. Copy your install command
2. Copy each code block in order
3. See a working feature
4. Understand how it works
5. Customize it for their needs

**No:** "See the guide for the complete example"
**Yes:** "Here's the complete working example, here's how it works, here's how to customize"
