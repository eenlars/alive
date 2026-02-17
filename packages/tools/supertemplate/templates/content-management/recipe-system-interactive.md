---
name: Interactive Recipe System
description: Professional recipe management with clickable ingredient tooltips, click-to-hide ingredients, localStorage persistence.
category: components
complexity: 3
files: 7
dependencies:
  - "@radix-ui/react-tooltip@^1.0.0"
  - react-router-dom@^6.20.0
estimatedTime: 25-30 minutes
estimatedTokens: 120
tags: [recipes, food, content, interactive, tooltips]
requires:
  - React 18+
  - TypeScript
  - Vite
  - Node 18+
previewImage: https://terminal.alive.best/_images/t/alive.best/o/2fa4c3e6ac7f134e/v/orig.webp
enabled: true
---

# Interactive Recipe System with Chef Workflow

A professional recipe management system with interactive features: clickable ingredients in instructions show tooltips with full measurements, ingredients can be marked as "gathered" (persisted in localStorage), and includes a comprehensive chef's workflow document for writing high-quality recipes. Perfect for food blogs, personal recipe collections, or cooking websites.

**Visual Result:** A clean recipe list page linking to detailed recipe pages. Each recipe shows ingredients (click to hide when gathered), instructions with inline ingredient tooltips (click "olive oil" to see "2 tbsp olive oil"), cooking times, servings, and optional notes/tags.

**Note:** This template provides the complete system structure with empty recipe arrays. You'll add your own recipes following the provided template format.

## Step-by-Step Implementation

### Step 1: Create Recipe TypeScript Interfaces

Create `src/recipes.ts`:

```typescript
/**
 * Recipe Template Interface
 *
 * Use this interface to add new recipes to your collection.
 * All fields marked with ? are optional.
 *
 * @example
 * {
 *   id: "recipe-slug",                    // URL-friendly identifier (use lowercase-with-hyphens)
 *   title: "recipe name",                 // Display name (lowercase)
 *   description: "brief summary",         // One-line description for recipe list
 *   servings: "4 people",                 // How many servings this makes
 *   time: {
 *     prep: "10 min",                     // Preparation time
 *     cook: "25 min",                     // Cooking time
 *     total: "35 min"                     // Total time (prep + cook)
 *   },
 *   ingredients: [
 *     {
 *       category: "for the sauce",        // Optional: group ingredients by category
 *       items: [
 *         "2 tbsp olive oil",              // Format: "quantity unit ingredient, details (weight)"
 *         "400g cherry tomatoes, halved"
 *       ]
 *     }
 *   ],
 *   instructions: [
 *     ["Heat the ", { ingredient: "2 tbsp olive oil" }, " in a large pan."],
 *     ["Add the ", { ingredient: "400g cherry tomatoes, halved", display: "tomatoes" }, " and cook."]
 *   ],
 *   notes: [                               // Optional: cooking tips, variations, storage
 *     "Can be made 3 days ahead"
 *   ],
 *   tags: ["vegetarian", "quick"]         // Optional: for filtering/searching
 * }
 */

// InstructionPart allows mixing plain text with ingredient references
// Plain string: "Heat the pan"
// Ingredient object: { ingredient: "2 tbsp olive oil", display: "olive oil" }
export type InstructionPart = string | { ingredient: string; display?: string }

export interface Recipe {
  id: string
  title: string
  description: string
  servings: string
  time: {
    prep: string
    cook: string
    total: string
  }
  ingredients: {
    category?: string
    items: string[]
  }[]
  instructions: InstructionPart[][]
  notes?: string[]
  tags?: string[]
}

/**
 * Recipe Collection
 *
 * Add your recipes to this array. Each recipe will automatically appear
 * in the recipe list and be accessible via /food/{recipe-id}
 *
 * Start with an empty array and add recipes using the RECIPE_TEMPLATE below.
 */
export const recipes: Recipe[] = [
  // Add your recipes here
  // Example:
  // {
  //   id: "your-recipe-slug",
  //   title: "your recipe name",
  //   description: "brief description",
  //   servings: "4 people",
  //   time: { prep: "10 min", cook: "20 min", total: "30 min" },
  //   ingredients: [{ items: ["2 tbsp olive oil", "..."] }],
  //   instructions: [["First step text"], ["Add the ", { ingredient: "2 tbsp olive oil" }, " to pan."]],
  //   notes: ["Optional cooking tip"],
  //   tags: ["tag1", "tag2"]
  // }
]

/**
 * Template for Adding New Recipes
 *
 * Copy this structure when adding a new recipe to the array above.
 */
export const RECIPE_TEMPLATE: Recipe = {
  id: "recipe-id",
  title: "recipe name",
  description: "brief description for the recipe list",
  servings: "4 people",
  time: {
    prep: "10 min",
    cook: "20 min",
    total: "30 min"
  },
  ingredients: [
    {
      category: "optional category name",
      items: [
        "quantity unit ingredient, details",
        "200g ingredient name"
      ]
    }
  ],
  instructions: [
    ["First step with plain text only."],
    ["Add the ", { ingredient: "2 tbsp olive oil" }, " to the pan and heat."],
    ["Stir in the ", { ingredient: "1 large onion, thinly sliced (220g)", display: "onion" }, " and cook until soft."]
  ],
  notes: [
    "Optional cooking tip",
    "Storage instructions",
    "Variation ideas"
  ],
  tags: ["tag1", "tag2"]
}
```

**What this does:** Defines the complete TypeScript structure for recipes. The `InstructionPart` type allows instructions to contain both plain text strings and ingredient objects with optional display names (e.g., show "onion" but tooltip shows full "1 large onion, thinly sliced (220g)").

### Step 2: Create Recipe List Page

Create `src/pages/Food.tsx`:

```typescript
import { Link } from "react-router-dom"
import BlogLayout from "@/components/BlogLayout"
import { recipes } from "@/recipes"

const Food = () => {
  return (
    <BlogLayout>
      <div className="space-y-6 md:space-y-8">
        <h2 className="text-2xl text-gray-900 lowercase mt-0">my recipes</h2>

        <div className="space-y-4">
          {recipes.map((recipe) => (
            <Link
              key={recipe.id}
              to={`/food/${recipe.id}`}
              className="block border-b border-gray-200 pb-4 last:border-0 hover:opacity-60 transition-opacity"
            >
              <h3 className="text-lg text-gray-900 lowercase">{recipe.title}</h3>
              <p className="text-sm text-gray-600 mt-1">{recipe.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </BlogLayout>
  )
}

export default Food
```

**What this does:** Creates a simple list page showing all recipes. Each recipe is a clickable link to its detail page. Uses lowercase styling for a minimal aesthetic.

### Step 3: Create Recipe Detail Page with Interactive Features

Create `src/pages/Recipe.tsx`:

```typescript
import { useParams, Link } from "react-router-dom"
import { useState, useEffect } from "react"
import BlogLayout from "@/components/BlogLayout"
import PageHeader from "@/components/PageHeader"
import { recipes } from "@/recipes"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const Recipe = () => {
  const { id } = useParams()
  const recipe = recipes.find((r) => r.id === id)
  const [hiddenIngredients, setHiddenIngredients] = useState<Set<string>>(new Set())
  const [openTooltip, setOpenTooltip] = useState<string | null>(null)

  // Load hidden ingredients from localStorage on mount
  // This persists which ingredients the user has "gathered" across page refreshes
  useEffect(() => {
    const stored = localStorage.getItem(`recipe-${id}-hidden`)
    if (stored) {
      setHiddenIngredients(new Set(JSON.parse(stored)))
    }
  }, [id])

  // Toggle ingredient visibility (mark as gathered/not gathered)
  const toggleIngredient = (ingredient: string) => {
    setHiddenIngredients(prev => {
      const next = new Set(prev)
      if (next.has(ingredient)) {
        next.delete(ingredient)
      } else {
        next.add(ingredient)
      }
      localStorage.setItem(`recipe-${id}-hidden`, JSON.stringify([...next]))
      return next
    })
  }

  // Extract clean ingredient name from full text for display in instructions
  // Example: "2 tbsp olive oil, extra virgin (30ml)" -> "olive oil"
  const extractIngredientName = (text: string) => {
    let result = text
      // Remove patterns like: "2 tbsp ", "3 tsp ", "1 large ", "2 cloves "
      .replace(/^\d+\s+(tbsp|tsp|pieces?|piece|cloves?|clove|pinches?|pinch|large|small)\s+/i, '')
      // Remove patterns like: "400g ", "200ml ", "55g "
      .replace(/^\d+\s*(g|kg|ml|l|cl)\s+/i, '')
      // Remove any remaining leading numbers
      .replace(/^\d+\s+/, '')

    // Split on comma or parenthesis and take first part
    const cleaned = result.split(',')[0].split('(')[0].trim()

    return cleaned
  }

  // Render instruction parts with ingredient tooltips
  const renderInstructionPart = (part: string | { ingredient: string; display?: string }) => {
    if (typeof part === 'string') {
      return part
    }

    // If display name provided, use it; otherwise extract from full ingredient text
    const ingredientName = part.display || extractIngredientName(part.ingredient)
    const isOpen = openTooltip === part.ingredient

    return (
      <Tooltip
        key={part.ingredient}
        delayDuration={0}
        open={isOpen}
        onOpenChange={(open) => setOpenTooltip(open ? part.ingredient : null)}
      >
        <TooltipTrigger asChild>
          <button
            onClick={(e) => {
              e.preventDefault()
              setOpenTooltip(isOpen ? null : part.ingredient)
            }}
            onTouchEnd={(e) => {
              e.preventDefault()
              setOpenTooltip(isOpen ? null : part.ingredient)
            }}
            className="inline-block px-1.5 py-0.5 bg-accent/20 text-foreground font-medium rounded-sm hover:bg-accent/30 active:bg-accent/40 transition-colors"
          >
            {ingredientName}
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="text-xs bg-foreground text-background border-foreground z-[100]"
          onPointerDownOutside={() => setOpenTooltip(null)}
        >
          {part.ingredient}
        </TooltipContent>
      </Tooltip>
    )
  }

  if (!recipe) {
    return (
      <BlogLayout>
        <div className="space-y-6">
          <h2 className="text-2xl text-gray-900 lowercase">recipe not found</h2>
          <Link to="/food" className="text-sm text-gray-600 hover:opacity-60">
            back to recipes
          </Link>
        </div>
      </BlogLayout>
    )
  }

  return (
    <BlogLayout>
      <div className="space-y-8">
        <PageHeader
          backTo="/food"
          backLabel="back to recipes"
          title={recipe.title}
          subtitle={recipe.description}
        />

        <div className="flex flex-col gap-2 text-sm text-gray-600 md:flex-row md:gap-6">
          <div>
            <span className="text-gray-400">serves:</span> {recipe.servings}
          </div>
          <div>
            <span className="text-gray-400">prep:</span> {recipe.time.prep}
          </div>
          <div>
            <span className="text-gray-400">cook:</span> {recipe.time.cook}
          </div>
          <div>
            <span className="text-gray-400">total:</span> {recipe.time.total}
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-900 lowercase">ingredients</h3>
          {recipe.ingredients.map((section, idx) => (
            <div key={idx} className="space-y-2">
              {section.category && (
                <p className="text-xs text-gray-500 uppercase tracking-wide">{section.category}</p>
              )}
              <ul className="space-y-2 text-sm">
                {section.items.map((item, itemIdx) => {
                  const isHidden = hiddenIngredients.has(item)
                  return (
                    <li key={itemIdx} className="flex items-start group">
                      <button
                        onClick={() => toggleIngredient(item)}
                        className={`inline-block px-3 py-1.5 bg-gradient-to-r transition-all duration-200 ${
                          isHidden
                            ? 'from-gray-200 to-gray-300 text-gray-400 line-through opacity-50'
                            : 'from-gray-50 to-gray-100 text-gray-700 hover:from-accent/5 hover:to-accent/10 hover:text-gray-900'
                        }`}
                      >
                        {item}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-900 lowercase">instructions</h3>
          <ol className="space-y-3 text-sm text-gray-700">
            {recipe.instructions.map((step, idx) => (
              <li key={idx} className="flex items-start">
                <span className="text-gray-400 mr-3 font-mono text-xs">{idx + 1}.</span>
                <span>
                  {step.map((part, partIdx) => (
                    <span key={partIdx}>{renderInstructionPart(part)}</span>
                  ))}
                </span>
              </li>
            ))}
          </ol>
        </div>

        {recipe.notes && recipe.notes.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-gray-900 lowercase">notes</h3>
            <ul className="space-y-1 text-sm text-gray-600 italic">
              {recipe.notes.map((note, idx) => (
                <li key={idx}>— {note}</li>
              ))}
            </ul>
          </div>
        )}

        {recipe.tags && recipe.tags.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {recipe.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs px-2 py-1 bg-gray-100 text-gray-600 lowercase"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </BlogLayout>
  )
}

export default Recipe
```

**What this does:** Creates the full recipe detail page with three key interactive features:

1. **Ingredient Tooltips in Instructions**: Click any highlighted ingredient word (like "olive oil") to see the full measurement in a tooltip
2. **Click-to-Hide Ingredients**: Click any ingredient to mark it as "gathered" (grays out with strikethrough)
3. **localStorage Persistence**: Your hidden ingredients are saved and restored when you return to the recipe

### Step 4: Update Router Configuration

Update `src/App.tsx` to add the recipe routes:

```typescript
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter, Route, Routes } from "react-router-dom"
import { TooltipProvider } from "@/components/ui/tooltip"
import Index from "./pages/Index"
import Food from "./pages/Food"
import Recipe from "./pages/Recipe"
// ... your other imports

const queryClient = new QueryClient()

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={0} skipDelayDuration={0}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/food" element={<Food />} />
            <Route path="/food/:id" element={<Recipe />} />
            {/* ... your other routes */}
            <Route path="*" element={<div>Not Found</div>} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  )
}

export default App
```

**What this does:** Registers the recipe routes so `/food` shows the list and `/food/pasta-harissa` shows the recipe detail.

### Step 5: Create PageHeader Component (If Not Already Present)

Create `src/components/PageHeader.tsx`:

```typescript
import { Link } from "react-router-dom"

interface PageHeaderProps {
  backTo: string
  backLabel?: string
  title: string
  subtitle?: string
}

const PageHeader = ({ backTo, backLabel = "back", title, subtitle }: PageHeaderProps) => {
  return (
    <div className="space-y-4">
      <Link to={backTo} className="text-sm text-gray-600 hover:opacity-60">
        ← {backLabel}
      </Link>
      <div>
        <h2 className="text-2xl text-gray-900 lowercase">{title}</h2>
        {subtitle && <p className="text-sm text-gray-600 mt-2">{subtitle}</p>}
      </div>
    </div>
  )
}

export default PageHeader
```

**What this does:** Provides a reusable header component with back navigation and title/subtitle.

### Step 6: Verify BlogLayout Component Exists

Ensure `src/components/BlogLayout.tsx` exists. If not, create it:

```typescript
import { useState } from "react"
import Sidebar from "./Sidebar"

interface BlogLayoutProps {
  children: React.ReactNode
}

const BlogLayout = ({ children }: BlogLayoutProps) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen h-screen bg-white flex overflow-hidden">
      {/* Mobile menu toggle button */}
      <button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="md:hidden fixed top-4 left-4 z-50 text-gray-900 bg-white p-2 rounded-full shadow-sm"
        aria-label={isSidebarOpen ? "Close menu" : "Open menu"}
      >
        {isSidebarOpen ? (
          <svg className="w-6 h-6" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

      {/* Main Content */}
      <main className="flex-1 md:ml-96 overflow-y-auto">
        <div className="px-4 pt-20 pb-16 md:px-8 md:py-6 max-w-2xl">
          {children}
        </div>
      </main>
    </div>
  )
}

export default BlogLayout
```

**Note:** This assumes you have a `Sidebar` component. If you don't have one, you can simplify this to just render `{children}` inside a container div.

### Step 7: Add Chef's Workflow Document

Create `chef-recipe-workflow.md` in your project root:

```markdown
# Chef's Recipe Development & Validation Workflow

## Initial Input Processing
START → Receive recipe request or ingredients list
  ↓
  Is input clear & complete?
  ├─ NO → Ask clarifying questions (servings? dietary restrictions? skill level? available equipment?)
  └─ YES → Proceed to concept phase

## Concept & Flavor Architecture
Define the dish identity
  ↓
  • What cuisine/tradition does this belong to?
  • What's the star ingredient? What supports it?
  • What's the flavor balance? (fat/acid/salt/sweet/umami)
  • What's the textural contrast? (crispy/creamy/chewy/soft)
  ↓
Sketch the dish mentally: "I see glistening pasta, golden vegetables, bright green herbs, golden breadcrumbs on top"

## Equipment Planning (CRITICAL - often forgotten)
Before writing ANY steps, decide:
  ↓
  • What pans/pots are needed? (large pot for pasta, sauté pan for sauce, sheet pan for roasting)
  • Can steps overlap? (roast vegetables while making sauce)
  • What size pan? (sauce pan must fit all pasta later - minimum 28cm for 2 servings)
  • Oven or stovetop? (oven = hands-free, consistent; stovetop = more control but needs attention)

## Ingredient List Construction
For each ingredient, specify:
  ↓
  • Exact amount (weight > volume when possible)
  • Preparation state ("thinly sliced", "finely chopped", "crushed with side of knife")
  • Visual/quality cue when relevant ("ripe tomatoes", "good-quality anchovies")
  • Group by usage (mise en place logic: "for sauce", "for topping")
  ↓
CHECK: Do quantities make sense for servings? (200g pasta = 2 generous servings ✓)

## Method Development - Step by Step

### For EACH step, think through:
1. **Temperature & Timing First**
   - What heat level? (low/medium/high - be specific, not vague)
   - How long? (give range if variable: "2-3 min" OR specific cue: "until golden")
   - Can this go wrong? (burning garlic, overcooking pasta, breaking emulsion)

2. **Pan/Vessel Specification**
   - Which pan/pot for this step?
   - Cold start or hot start? ("heat oil first" vs "start in cold pan")
   - Covered or uncovered?

3. **Action Verbs - Be Precise**
   - Don't say "cook" → say "sauté" / "roast" / "simmer" / "boil"
   - Don't say "add" → say "stir in" / "fold through" / "scatter over"
   - Technical terms when needed: "emulsify", "sweat", "reduce"

4. **Sensory Checkpoints (the chef's eyes/nose/ears)**
   - Visual: "until golden and wrinkled", "until oil separates at edges", "until glossy"
   - Aroma: "until fragrant", "until garlic is soft but not brown"
   - Sound: "sizzling gently", "rapid boil"
   - Touch: "until tender when pierced"
   - Taste: "adjust seasoning"

5. **The "Why" Behind Technique**
   - If you salt vegetables → explain why (or remove if unnecessary)
   - If you start garlic in cold oil → explain why
   - If you undercook pasta → explain it finishes in sauce
   - If you reserve pasta water → explain emulsification

## Step Sequencing Logic
Ask yourself:
  ↓
  • What takes longest? (start that first - roasting vegetables)
  • What can run parallel? (make breadcrumbs while vegetables roast; boil pasta while sauce simmers)
  • What must be sequential? (garlic before tomatoes)
  • What's the critical path? (pasta must be ready when sauce is ready - time it)
  ↓
DRAW THE TIMELINE mentally:
  0 min: Oven on, vegetables in
  5 min: Start breadcrumbs
  10 min: Start sauce (garlic → tomatoes)
  20 min: Boil pasta water
  25 min: Pasta in, vegetables out
  35 min: Combine everything, serve

## Critical Technique Checkpoints

### Temperature Control
- Garlic: LOW heat, cold start (prevents burning)
- Vegetables: MEDIUM-high oven heat (200°C not 220°C - prevents burning outside before inside cooks)
- Sauce finishing: MEDIUM heat (not high - breaks emulsion)

### Timing Precision
- Pasta: Cook 2 min LESS than package says (finishes in sauce)
- Sauce: Simmer until "oil separates" (visual cue = done)
- Vegetables: Must be "completely soft" not just "golden" (textural cue)

### Salt Strategy
- Pasta water: "taste like seawater" (critical - pasta won't be seasoned otherwise)
- Check ingredients first: some are already salty (capers, olives, anchovies)
- Finish: taste and adjust (always)

## The Final Assembly - Most Critical Phase
Think like building architecture:
  ↓
  1. Warm/empty serving bowls? (keeps dish hot)
  2. Sauce ready and hot in large pan
  3. Components folded into sauce (gentle - don't break them up)
  4. Pasta goes in UNDERDRAINED (some water clinging = good)
  5. Add small amount of pasta water (3-4 tbsp)
  6. Toss on MEDIUM heat (emulsify starch + oil + water)
  7. Check consistency: "sauce should coat pasta like a hug, not swim"
  8. OFF heat → add herbs, raw olive oil (keeps them fresh/bright)

## Plating & Finishing
- How to plate? (twirl pasta? casual heap? shallow bowl vs deep plate?)
- Garnish order: crunchy elements on top (stays crispy), extra herbs, olive oil drizzle
- Serve immediately (pasta waits for no one)

## Pre-Publication Validation Checklist

### Ingredient List Review
□ All ingredients mentioned in steps are in the list
□ All ingredients in list are used in steps (no orphans)
□ Quantities are realistic for stated servings
□ Preparation is specified ("sliced", "chopped", etc.)
□ Grouping makes sense (mise en place logic)

### Steps Review
□ Steps are in correct chronological order
□ Parallel steps are indicated ("meanwhile", "while X is cooking")
□ Every pan/pot is specified
□ Every temperature is specified (don't say "heat" - say "medium heat")
□ Timing is realistic (add 20-30% buffer for home cooks)
□ Visual/sensory cues are given ("until golden", "until fragrant")

### Technique Review
□ No outdated techniques (only if they serve a purpose)
□ Temperatures are scientifically sound
□ Critical techniques are explained (emulsification, why undercook pasta)
□ "Why" is included for non-obvious steps

### Timing Sanity Check
□ Total time = realistic sum of all steps (not aspirational)
□ Prep time = actual knife work + gathering (be honest)
□ Cook time = longest sequential path (not all steps added up)
□ Does the timeline make physical sense?

### Equipment Sanity Check
□ Is pan size mentioned? (critical for sauce reduction, pasta finishing)
□ Is it equipment a home cook has? (if not, give alternative)
□ Are there enough pans? (don't ask for 4 pans if you can use 2)

### Language & Clarity
□ Action verbs are specific (sauté, not cook)
□ Measurements are precise (2-3 tbsp, not "some")
□ Ambiguity is removed ("2 min before al dente" → "2 min less than package")
□ Technical terms are explained in notes if not obvious

### Cultural & Traditional Accuracy
□ Is this authentic to the stated cuisine?
□ Are there sacrilegious elements? (e.g., certain ingredient combinations to avoid)
□ Are traditional substitutions offered?

### The Taste Test (Mental)
Close your eyes and imagine eating this:
  ↓
  • Can you taste each component?
  • Is there balance? (not too salty, not too acidic, not too oily)
  • Is there contrast? (soft/crispy, hot/cool)
  • Would you want another bite? (if not, what's missing?)

### The Home Cook Test
Put yourself in their kitchen:
  ↓
  • Can they succeed on first try? (if no, simplify)
  • Are there "gotcha" moments? (garlic burning, pasta overcooked - warn them)
  • Is the payoff worth the effort?
  • Will they make it again? (if no, too complicated)

## Final Read-Through - Out Loud
Read the recipe aloud as if you're teaching someone:
  ↓
  • Does it flow naturally?
  • Are there awkward phrases?
  • Does each step lead logically to the next?
  • Would YOU want to cook this?

## Notes Section - The Chef's Whispers
Add the things that elevate the dish:
  ↓
  • Variations (without making it a different dish)
  • Make-ahead tips (practicality)
  • Substitutions (if acceptable)
  • Cultural context (story, tradition - makes it memorable)
  • Storage & reheating (real life)

## Sign-Off Question
"If my grandmother/mentor/food critic tasted this, would they approve?"
  ├─ NO → Revise technique, balance, or presentation
  └─ YES → Publish

END

---

## Key Principles Summary

**Think like an engineer:** Equipment → Timeline → Method → Validation
**Write like a teacher:** Clear, specific, no ambiguity, sensory cues
**Taste like a critic:** Balance, contrast, authenticity, memorability
**Test like a home cook:** Realistic timing, available equipment, repeatable results

The best recipes are not just instructions - they're a conversation between chef and cook, where the chef anticipates questions before they're asked.
```

**What this does:** Provides a comprehensive workflow for writing high-quality, professional recipes. Use this as a reference when creating new recipes for your system.

## How It Works

### Recipe Data Structure

The recipe system uses a TypeScript interface that supports **inline ingredient references** within instructions. This is the key innovation:

```typescript
// Instead of just strings:
instructions: [
  "Add the olive oil to the pan"
]

// You can reference ingredients inline:
instructions: [
  ["Add the ", { ingredient: "2 tbsp olive oil" }, " to the pan"]
]
```

When rendered, "olive oil" becomes a clickable button that shows "2 tbsp olive oil" in a tooltip.

### Ingredient Name Extraction

The `extractIngredientName` function uses regex patterns to strip quantities and measurements from ingredient text:

- Removes units like "tbsp", "tsp", "g", "ml"
- Removes numbers
- Removes descriptors like "large", "small"
- Splits on commas/parentheses to get the core ingredient name

Example: `"2 tbsp olive oil, extra virgin (30ml)"` → `"olive oil"`

### localStorage Persistence

Each recipe's hidden ingredients are stored in localStorage with the key `recipe-{recipeId}-hidden`. This means:
- Users can mark ingredients as "gathered" and close the browser
- When they return, their progress is restored
- Each recipe has independent state

### Tooltip Management

The tooltip system uses controlled state (`openTooltip`) to ensure only one tooltip shows at a time:
- Click an ingredient button → opens its tooltip
- Click another ingredient → closes first, opens second
- Click outside → closes tooltip

Works on both desktop (click) and mobile (touch) devices.

## Customization Examples

### Change Display Style

Make ingredients look like tags instead of buttons:

```typescript
// In Recipe.tsx, update the TooltipTrigger button className:
className="inline-block px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold hover:bg-blue-200"
```

### Add Ingredient Search/Filter

Add a search box above the ingredient list:

```typescript
const [searchTerm, setSearchTerm] = useState("")

const filteredIngredients = recipe.ingredients.map(section => ({
  ...section,
  items: section.items.filter(item =>
    item.toLowerCase().includes(searchTerm.toLowerCase())
  )
}))

// In JSX:
<input
  type="text"
  value={searchTerm}
  onChange={(e) => setSearchTerm(e.target.value)}
  placeholder="Search ingredients..."
  className="w-full px-3 py-2 border rounded"
/>
```

### Add Recipe Rating System

Add a rating field to the Recipe interface:

```typescript
export interface Recipe {
  // ... existing fields
  rating?: number // 1-5 stars
}

// In Recipe.tsx, add star display:
{recipe.rating && (
  <div className="flex gap-1">
    {Array.from({ length: 5 }).map((_, i) => (
      <span key={i} className={i < recipe.rating! ? "text-yellow-500" : "text-gray-300"}>
        ★
      </span>
    ))}
  </div>
)}
```

### Export to Shopping List

Add a button to export all ingredients to a text file:

```typescript
const exportShoppingList = () => {
  const allIngredients = recipe.ingredients
    .flatMap(section => section.items)
    .join('\n')

  const blob = new Blob([allIngredients], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${recipe.title}-shopping-list.txt`
  a.click()
  URL.revokeObjectURL(url)
}

// Add button in JSX:
<button
  onClick={exportShoppingList}
  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
>
  Export Shopping List
</button>
```

## Important Notes

### Ingredient Tooltips Best Practices

- **Always provide display names** for long ingredients: `{ ingredient: "1 large onion, thinly sliced (220g)", display: "onion" }`
- **Keep display names short** (1-2 words) so they fit inline naturally
- **Use exact same text** for the ingredient field as what appears in your ingredient list

### localStorage Limitations

- localStorage is per-browser and per-device (doesn't sync across devices)
- Each browser has a ~5-10MB limit (plenty for recipes)
- Clearing browser data will reset all hidden ingredients
- For multi-device sync, you'd need to implement a backend with user accounts

### Mobile Considerations

- The tooltip system uses both `onClick` and `onTouchEnd` for mobile compatibility
- Ingredients are styled with large tap targets (padding) for easy mobile interaction
- The `onPointerDownOutside` handler ensures tooltips close when tapping elsewhere

### TypeScript Type Safety

The `InstructionPart` type union ensures you can't accidentally mix up the structure:

```typescript
// ✅ Valid
["Add ", { ingredient: "oil" }, " to pan"]

// ❌ TypeScript error - missing 'ingredient' key
["Add ", { text: "oil" }, " to pan"]
```

### Performance Optimization

For very large recipe collections (100+ recipes):
- Consider lazy loading recipe content (only load full recipe when viewing detail page)
- Implement recipe search/filter with debouncing
- Add pagination to the recipe list

### SEO Considerations

For better search engine visibility:
- Add `<meta>` tags with recipe schema (JSON-LD format)
- Use semantic HTML (`<article>`, `<time>`, etc.)
- Add `alt` text if you include recipe images

## Common Troubleshooting

### Issue: Tooltips Not Showing

**Symptom:** Clicking ingredients in instructions does nothing

**Solution:** Verify `TooltipProvider` is wrapping your app in `App.tsx`:

```typescript
<TooltipProvider delayDuration={0} skipDelayDuration={0}>
  {/* Your routes here */}
</TooltipProvider>
```

### Issue: Ingredients Don't Stay Hidden

**Symptom:** Hidden ingredients reset when refreshing the page

**Solution:** Check browser console for localStorage errors. Some browsers block localStorage in private/incognito mode. Also verify the recipe `id` is stable (not changing on each render).

### Issue: Ingredient Extraction Wrong

**Symptom:** Tooltip shows wrong ingredient name (e.g., "2" instead of "olive oil")

**Solution:** Either provide explicit `display` property or adjust the regex in `extractIngredientName`. Example:

```typescript
// Instead of relying on extraction:
{ ingredient: "2 tbsp olive oil" }

// Provide explicit display:
{ ingredient: "2 tbsp olive oil", display: "olive oil" }
```

### Issue: Tooltip Stays Open When Clicking Another

**Symptom:** Multiple tooltips show at once

**Solution:** Ensure you're using the controlled `open` and `onOpenChange` props on the Tooltip component, not the uncontrolled mode.

### Issue: Recipe Not Found (404)

**Symptom:** Clicking recipe link shows "recipe not found"

**Solution:** Verify the recipe `id` in your recipe data matches the URL parameter. Example:

```typescript
// Recipe data:
{ id: "my-recipe", ... }

// Must match URL:
/food/my-recipe
```

### Issue: TypeScript Errors on Instructions

**Symptom:** `Type 'string' is not assignable to type 'InstructionPart[]'`

**Solution:** Instructions must be an array of arrays. Change:

```typescript
// ❌ Wrong
instructions: [
  "Step 1 text",
  "Step 2 text"
]

// ✅ Correct
instructions: [
  ["Step 1 text"],
  ["Step 2 text"]
]
```

### Issue: Mobile Tooltips Don't Close

**Symptom:** On mobile, tapping outside tooltip doesn't close it

**Solution:** Ensure `onPointerDownOutside` handler is present in `TooltipContent`:

```typescript
<TooltipContent
  onPointerDownOutside={() => setOpenTooltip(null)}
>
  {part.ingredient}
</TooltipContent>
```

## Testing & Validation

### Manual Testing Checklist

1. **Recipe List Page**
   - [ ] All recipes appear in the list
   - [ ] Clicking a recipe navigates to detail page
   - [ ] Recipe titles and descriptions are readable
   - [ ] Hover effects work

2. **Recipe Detail Page**
   - [ ] Recipe loads correctly
   - [ ] All sections display (ingredients, instructions, notes, tags)
   - [ ] Times and servings show correctly
   - [ ] Back button returns to list

3. **Ingredient Interaction**
   - [ ] Clicking an ingredient marks it as hidden (gray + strikethrough)
   - [ ] Clicking again unhides it
   - [ ] Hidden state persists after page refresh
   - [ ] Works on mobile (touch interaction)

4. **Instruction Tooltips**
   - [ ] Highlighted ingredients are clickable
   - [ ] Clicking shows tooltip with full measurement
   - [ ] Tooltip closes when clicking another ingredient
   - [ ] Tooltip closes when clicking outside
   - [ ] Works on mobile (touch interaction)
   - [ ] Display names show correctly (e.g., "onion" not "1 large onion...")

5. **Responsive Design**
   - [ ] Layout works on mobile (< 640px)
   - [ ] Layout works on tablet (640-1024px)
   - [ ] Layout works on desktop (> 1024px)
   - [ ] Sidebar (if present) toggles on mobile

### Test Data

Create a test recipe using the `RECIPE_TEMPLATE` to verify:
- Recipe with multiple ingredients and inline tooltips
- Recipe with minimal ingredients for simpler testing

### Edge Cases to Test

1. **Empty states**:
   - Recipe with no notes
   - Recipe with no tags
   - Recipe with single ingredient section (no category)

2. **Long content**:
   - Recipe with 20+ ingredients
   - Recipe with 15+ instruction steps
   - Very long ingredient names

3. **localStorage**:
   - Mark all ingredients as hidden
   - Navigate away and back
   - Clear browser data and verify reset

## Migration from Other Recipe Systems

### From Plain Text Recipes

If you have recipes in plain text format:

1. Create a new recipe object in `recipes.ts`
2. Copy ingredient list to `ingredients[0].items` array
3. Split instructions into steps (one per array element)
4. For each step, wrap in array: `"Step text"` → `["Step text"]`
5. Identify key ingredients and convert to inline references:
   - Find ingredient mentions in steps
   - Replace with `{ ingredient: "full text", display: "short name" }`

### From JSON Recipe Schema

If you have recipe-schema.org JSON:

```typescript
// Map JSON schema to our interface:
{
  id: slug(name),
  title: name.toLowerCase(),
  description: description,
  servings: `${recipeYield} people`,
  time: {
    prep: prepTime,
    cook: cookTime,
    total: totalTime
  },
  ingredients: [{
    items: recipeIngredient // array of strings
  }],
  instructions: recipeInstructions.map(step => [step.text]),
  notes: [],
  tags: recipeCategory?.split(',') || []
}
```

### From Database

If recipes are in a database, create a script to export them:

```typescript
// export-recipes.ts
import { recipes } from './src/recipes'
import fs from 'fs'

const exported = recipes.map(r => ({
  ...r,
  // Transform as needed
}))

fs.writeFileSync('recipes-export.json', JSON.stringify(exported, null, 2))
```

## Best Practices

### Recipe Writing

- **Be specific with measurements**: Use grams/ml when possible, not cups
- **Include preparation in ingredient list**: "2 cloves garlic, minced" not "2 cloves garlic" + "Mince the garlic" as separate step
- **Use sensory cues**: "until golden brown" not "cook for 5 minutes"
- **Provide context**: Add notes about why techniques are used
- **Test your recipes**: Actually cook them before publishing

### Code Organization

- **Keep recipes in separate file**: Don't mix with component code
- **Group by category**: Use ingredient `category` field for logical grouping
- **Consistent naming**: Use lowercase kebab-case for IDs
- **Comment complex logic**: Especially the regex extraction functions

### Accessibility

- **Use semantic HTML**: `<button>` for interactive elements, `<ol>` for ordered lists
- **Provide keyboard navigation**: Tooltips work with Enter/Space keys
- **Sufficient color contrast**: Gray text on white background meets WCAG AA
- **Touch targets**: Minimum 44x44px tap targets for mobile

### Performance

- **Lazy load images**: If adding recipe photos, use lazy loading
- **Memoize expensive calculations**: Use `useMemo` for filtered/sorted lists
- **Debounce search**: If adding search, debounce the input
- **Virtual scrolling**: For 100+ recipes, implement virtual scrolling

## Future Enhancements

### Potential Features to Add

1. **Recipe Search**: Full-text search across titles, ingredients, tags
2. **Filter by Tags**: Click a tag to show all recipes with that tag
3. **Cooking Mode**: Larger text, voice commands, keep-screen-awake
4. **Print Stylesheet**: Optimize layout for printing
5. **Recipe Scaling**: Adjust servings and auto-calculate new quantities
6. **Nutrition Facts**: Add calorie/macro information
7. **Recipe Photos**: Add hero images and step-by-step photos
8. **User Notes**: Let users add personal notes to recipes
9. **Share Recipes**: Generate shareable links or export to PDF
10. **Import Recipes**: Paste URL to auto-extract recipe from website

### Advanced Features

- **User Accounts**: Save recipes across devices
- **Recipe Collections**: Create custom collections/meal plans
- **Grocery List**: Combine ingredients from multiple recipes
- **Substitutions**: Suggest ingredient alternatives
- **Recipe Timeline**: Visual timeline of cooking steps
- **Video Integration**: Embed step-by-step video instructions

## Version History

- **v1.0.0** (2025-11-10): Initial release with core features (ingredient tooltips, click-to-hide, localStorage persistence)

---

Ready to implement this template
