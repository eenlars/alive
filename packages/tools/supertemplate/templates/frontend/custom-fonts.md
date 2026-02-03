---
name: Custom Fonts Library
description: Self-hosted font library with Satoshi, Helvetica Now, and Inter Display. No CDN dependencies.
category: setup
complexity: 1
files: 2
dependencies: []
estimatedTime: 3-5 minutes
estimatedTokens: 40
tags: [font, typography, satoshi, helvetica, inter, tailwind]
requires:
  - Vite 5+
  - React 18+
  - TailwindCSS
previewImage: https://terminal.goalive.nl/_images/t/alive.best/o/e6aa1a718bcfd3dc/v/orig.webp
enabled: true
---

# Custom Fonts - Shared Font Library

Add beautiful custom fonts to your project using the shared font library hosted on `alive.best`. No need to copy font files - just reference them directly.

## Available Fonts

| Font | Weights | URL |
|------|---------|-----|
| **Satoshi** (Variable) | 300-900 | `https://alive.best/fonts/Satoshi-Variable.woff2` |
| **Satoshi Bold** | 700 | `https://alive.best/fonts/Satoshi-Bold.woff2` |

---

## Quick Setup (2 steps)

### Step 1: Add to `index.html` `<head>`

```html
<!-- Preload font to avoid render blocking -->
<link rel="preload" href="https://alive.best/fonts/Satoshi-Variable.woff2" as="font" type="font/woff2" crossorigin>
```

> **Why `crossorigin`?** Required for cross-origin font requests. Without it, the preload is ignored and the font won't load.

### Step 2: Add to `src/index.css`

```css
/* Satoshi Variable Font - from shared library */
@font-face {
  font-family: "Satoshi";
  src: url("https://alive.best/fonts/Satoshi-Variable.woff2") format("woff2-variations"),
       url("https://alive.best/fonts/Satoshi-Variable.woff") format("woff");
  font-style: normal;
  font-weight: 300 900;
  font-display: swap;
}
```

**That's it!** The font is now available to use.

---

## Usage Examples

### With Tailwind

**`tailwind.config.ts`:**
```typescript
export default {
  theme: {
    extend: {
      fontFamily: {
        satoshi: ["Satoshi", "Inter", "Arial", "sans-serif"],
      },
    },
  },
}
```

**In components:**
```tsx
<h1 className="font-satoshi font-bold">Heading with Satoshi</h1>
<p className="font-satoshi font-normal">Body text</p>
```

### Apply to all headings

**In `src/index.css`:**
```css
@layer base {
  h1, h2, h3, h4, h5, h6 {
    font-family: 'Satoshi', 'Inter', sans-serif;
    font-weight: 700;
    letter-spacing: -0.02em;
  }
}
```

---

## Complete Example

### `index.html`
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />

    <!-- ⚡ PRELOAD FONT - prevents render blocking -->
    <link rel="preload" href="https://alive.best/fonts/Satoshi-Variable.woff2" as="font" type="font/woff2" crossorigin>

    <title>Your App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### `src/index.css`
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Satoshi from shared font library */
@font-face {
  font-family: "Satoshi";
  src: url("https://alive.best/fonts/Satoshi-Variable.woff2") format("woff2-variations"),
       url("https://alive.best/fonts/Satoshi-Variable.woff") format("woff");
  font-style: normal;
  font-weight: 300 900;
  font-display: swap;
}

@layer base {
  h1, h2, h3, h4, h5, h6 {
    font-family: 'Satoshi', 'Inter', sans-serif;
    font-weight: 700;
  }
}
```

---

## Why Preloading Matters

**Without preload** (slow - 2+ second delay):
```
HTML → CSS → Parse CSS → Discover font → Load font (BLOCKING!)
```

**With preload** (fast - parallel loading):
```
HTML → CSS ────────────→ Render
     → Font (parallel) ↗
```

The preload tells the browser to start downloading the font immediately, in parallel with CSS parsing.

---

## Troubleshooting

### Font Not Loading

1. **Check `crossorigin` attribute** - Required for cross-origin fonts. Must be present on both preload and implicit in @font-face
2. **Check browser console** - Look for CORS errors
3. **Verify URL** - Open `https://alive.best/fonts/Satoshi-Variable.woff2` directly in browser

### Font Blocking Render (Slow)

Ensure the preload `<link>` is:
1. In the `<head>` section
2. BEFORE any `<link rel="stylesheet">` or `<style>` tags
3. Has `crossorigin` attribute

### CORS Errors

If you see CORS errors, the `crossorigin` attribute is missing. Add it to the preload:
```html
<link rel="preload" href="..." crossorigin>
```

---

## Font Licenses

- **Satoshi**: Free for personal & commercial use ([Fontshare](https://www.fontshare.com/fonts/satoshi))

---

**Last Updated:** 2025-12-05
**Template Version:** 1.0.0
