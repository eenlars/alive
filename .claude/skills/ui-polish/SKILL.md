---
name: ui-polish
description: Finishing touches and polish patterns for UI components. Use when refining chat inputs, buttons, containers, attachment chips, dropdowns, textareas, or any interactive component to feel smooth and modern.
---

# UI Polish Guide

Learnings and best practices for making components feel smooth, modern, and intentional. Sourced from real research on ChatGPT, shadcn/ui, Radix, and modern CSS patterns.

## Table of Contents

1. [Container Polish](#container-polish)
2. [Send / Action Button](#send--action-button)
3. [Textarea Input](#textarea-input)
4. [Attachment Chips & Pills](#attachment-chips--pills)
5. [Dropdown / Popover Menus](#dropdown--popover-menus)
6. [Toolbar Buttons (Inline Actions)](#toolbar-buttons-inline-actions)
7. [General Principles](#general-principles)
8. [Anti-Patterns](#anti-patterns)

---

## Container Polish

The wrapper that holds the input, toolbar, and attachments.

**Key techniques:**
- `rounded-3xl` for a generous, modern pill shape
- Use `ring` instead of `border` for focus states (no layout shift, stackable with border)
- `shadow-lg` at rest gives the floating card feel
- Very low-opacity borders: `border-black/[0.08]` at rest, subtle ring transitions on focus/hover
- `transition-all duration-150 ease-in-out` for smooth state changes

**Pattern (Tailwind):**
```
rounded-3xl
border border-black/[0.08] dark:border-white/[0.08]
shadow-lg
ring-1 ring-black/[0.06] dark:ring-white/[0.06]
transition-all duration-150 ease-in-out
focus-within:ring-black/[0.14]
hover:ring-black/[0.10]
```

**Why ring over border for focus:**
- `box-shadow` / `ring` does NOT alter computed dimensions (no reflow)
- Can be layered: border for structure, ring for interactive feedback
- Smooth transitions without layout jank

**Reference:** ChatGPT uses `ring-1 ring-black/[0.08]` with hover/focus transitions.

---

## Send / Action Button

The primary action button (send message, stop, etc.)

**Key techniques:**
- Circular shape: `rounded-full` with fixed `size-8` or `size-9`
- Use proper SVG icons (Lucide `ArrowUp`, `Square`) instead of text characters
- `brightness` for hover/active instead of color swaps (feels more tactile)
- `focus-visible:ring-1` for keyboard-only focus indication
- Disabled state: low opacity (`opacity-30`) AND disable hover effects

**Pattern (Tailwind):**
```
shrink-0 size-8 rounded-full
bg-black dark:bg-white text-white dark:text-black
hover:brightness-[0.85] active:brightness-75
transition-all duration-150 ease-in-out
disabled:opacity-30 disabled:hover:brightness-100
focus:outline-none focus-visible:ring-1 focus-visible:ring-ring
```

**Icon sizing:**
- Send arrow: `size={18} strokeWidth={2.5}` (bold, clear)
- Stop square: `size={14} fill="currentColor"` (filled, compact)
- Spinner: `size={14}` with `animate-spin`

**Reference:** ChatGPT uses circular send buttons with arrow-up icons. Modern UIs layer `brightness` hover with `before:` gradient overlays.

---

## Textarea Input

The text area where users type their message.

**Key techniques:**
- `leading-relaxed` for breathable line spacing
- `no-scrollbar` class to hide scrollbar (content still scrollable)
- Lighter placeholder: `placeholder:text-black/30` (whispers, not shouts)
- Even horizontal padding: `px-4` (not asymmetric left/right)
- `resize-none` always; auto-grow via JS using `scrollHeight`
- `border-0 bg-transparent` since the container handles the border

**Auto-resize best practice:**
- Use `requestAnimationFrame` to align resize with browser repaint (prevents jitter)
- Reset to `minHeight` first, then set to `Math.min(scrollHeight, maxHeight)`
- Modern CSS alternative: `field-sizing: content` (Chrome 119+, not yet universal)

**Pattern (Tailwind):**
```
w-full resize-none border-0 bg-transparent
text-base leading-relaxed font-normal
focus:outline-none
py-3 px-4
text-black dark:text-white
placeholder:text-black/30 dark:placeholder:text-white/30
no-scrollbar
```

**Reference:** CSS-Tricks auto-growing textarea pattern. Subframe chat examples use `padding: 12px 15px; border-radius: 20px; transition: all 0.2s ease`.

---

## Attachment Chips & Pills

Preview cards for files, images, prompts attached to the message.

**Key techniques:**
- Background fills instead of borders: `bg-black/[0.04]` (softer, more modern)
- `rounded-xl` for generous but not fully-round shape
- Hover state: slightly darker fill (`hover:bg-black/[0.07]`)
- Smaller thumbnails: `size-9` with `rounded-lg`
- Subtler text hierarchy: title at `text-black/80`, subtitle at `text-[11px] text-black/40`
- Remove (X) button: appears on hover with `opacity-0 group-hover:opacity-100 hover:scale-110`
- Thinner progress bar: `h-0.5` matching chip border radius
- Mode toggle pills: `rounded-full` with tinted backgrounds (`bg-purple-500/10`)

**Pattern for chip (Tailwind):**
```
relative group flex items-center gap-2.5 pl-2 pr-3 py-1.5
rounded-xl transition-colors
bg-black/[0.04] dark:bg-white/[0.06]
hover:bg-black/[0.07] dark:hover:bg-white/[0.09]
```

**Pattern for remove button:**
```
absolute -top-1.5 -right-1.5 size-5
rounded-full bg-black/70 dark:bg-white/80 text-white dark:text-black
opacity-0 group-hover:opacity-100 hover:scale-110
transition-all duration-150 shadow-sm
```

**Don'ts:**
- Don't use visible borders on chips (dated look)
- Don't make thumbnails too large (12x12 is too big; 9x9 is right)
- Don't use solid black/white for remove button (too harsh; use `bg-black/70`)

**Reference:** Material Tailwind chips. Mobbin chip design patterns.

---

## Dropdown / Popover Menus

Context menus, prompt pickers, and action menus.

**Key techniques:**
- `rounded-2xl` with `shadow-xl` for the floating panel
- Same ring pattern as container: `ring-1 ring-black/[0.04]`
- Entrance animation: `animate-in fade-in slide-in-from-bottom-2 duration-150`
- Items use `rounded-xl` hover states with very low opacity fills
- Each item can have its own icon container: `size-8 rounded-lg bg-purple-500/10`
- Tight padding: `p-1.5` on container, `px-3 py-2.5` on items
- Use `left-0` (anchored to trigger) not `right-0` (feels disconnected)

**Pattern for menu container (Tailwind):**
```
absolute bottom-full left-0 mb-2 w-64
bg-white dark:bg-neutral-900
border border-black/[0.08] dark:border-white/[0.08]
rounded-2xl shadow-xl
ring-1 ring-black/[0.04] dark:ring-white/[0.04]
z-20 max-h-96 overflow-y-auto overflow-hidden
animate-in fade-in slide-in-from-bottom-2 duration-150
```

**Pattern for menu item (Tailwind):**
```
w-full text-left px-3 py-2.5 rounded-xl
hover:bg-black/[0.04] dark:hover:bg-white/[0.06]
active:bg-black/[0.07] dark:active:bg-white/[0.09]
transition-colors
```

**For production:** Consider using Radix UI Popover for proper focus management, collision detection, portal rendering, and WAI-ARIA compliance. Radix uses Floating UI internally.

**Reference:** Radix UI Popover docs. shadcn/ui Popover component.

---

## Toolbar Buttons (Inline Actions)

Small action buttons inside the input container (upload, prompts, selector).

**Key techniques:**
- Move toolbar INSIDE the container (not floating above)
- Layout: `flex items-center` row with toolbar left, send button right
- Button size: `size-8 rounded-full` (consistent with send button shape)
- Subtle color: `text-black/40` at rest, `hover:text-black/70` on hover
- Hover fill: `hover:bg-black/5` (barely-there background)
- Icon size: `size-4` (smaller than the button; clean breathing room)
- Gap: `gap-1` between toolbar buttons (tight, intentional)

**Pattern (Tailwind):**
```
flex items-center justify-center size-8 rounded-full
hover:bg-black/5 dark:hover:bg-white/5
active:bg-black/10 dark:active:bg-white/10
text-black/40 dark:text-white/40
hover:text-black/70 dark:hover:text-white/70
transition-colors
```

**Layout in container:**
```
<InputContainer>
  <AttachmentGrid />
  <Textarea />
  <div class="flex items-center px-3 pb-3">
    <div class="flex-1"><Toolbar /></div>
    <SendButton />
  </div>
</InputContainer>
```

**Reference:** Modern AI chat UIs place +, attach, theme, plan, settings, and send all in the bottom row of the same container.

---

## General Principles

### Opacity Scale
Use consistent opacity values across the component:
- `/[0.04]` - barely visible fill (chip background, hover base)
- `/[0.06-0.08]` - subtle border/ring at rest
- `/[0.10-0.14]` - hover/focus interactive feedback
- `/30` - whisper text (placeholders)
- `/40` - muted text (subtitles, icons at rest)
- `/70-80` - readable text (titles, icon hover)

### Transition Defaults
- `duration-150 ease-in-out` for most interactive states
- `duration-300 ease-out` for progress bars and larger animations
- `transition-all` when multiple properties change together
- `transition-colors` when only color/opacity changes

### Rounding Scale
Keep rounding consistent and intentional:
- `rounded-full` - buttons, pills, toggles
- `rounded-3xl` - main containers
- `rounded-2xl` - dropdown menus, large cards
- `rounded-xl` - chips, menu items, sub-containers
- `rounded-lg` - thumbnails, icon containers

### Shadow Scale
- `shadow-sm` - subtle lift (remove buttons, small elements)
- `shadow-lg` - main container (floating card feel)
- `shadow-xl` - dropdown menus (elevated above content)

### Dark Mode
- Always provide dark variants
- Dark borders/rings use `white/` instead of `black/`
- Dark backgrounds: `bg-neutral-900` for panels (not `bg-gray-900`, which is too blue)
- Dark hover fills: same pattern but `white/` variants

---

## Anti-Patterns

Things that make components feel dated or rough:

| Don't | Do Instead |
|---|---|
| `border-2` with color | `border` + `ring-1` at low opacity |
| Text arrows (`→`) | SVG icons (Lucide `ArrowUp`) |
| `rounded-md` / `rounded-lg` on containers | `rounded-2xl` / `rounded-3xl` |
| Solid color hover (`hover:bg-gray-200`) | Opacity hover (`hover:bg-black/5`) |
| `opacity-50` for disabled | `opacity-30` + disable hover effects |
| Floating toolbar above input | Toolbar row inside the container |
| Large thumbnails in chips | `size-9` with `rounded-lg` |
| Visible border on chips | Background fill only |
| `bg-gray-900` in dark mode | `bg-neutral-900` (warmer) |
| Color swap for hover | `brightness` for primary buttons |
