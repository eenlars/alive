---
name: Carousel with Thumbnails
description: Advanced carousel with thumbnail navigation below. Click thumbnails to jump to slides.
category: components
complexity: 2
files: 4
dependencies:
  - swiper@^11.0.0
estimatedTime: 4-5 minutes
estimatedTokens: 18
tags: [react, carousel, thumbnails, slider]
requires:
  - React 18+
previewImage: https://terminal.alive.best/_images/t/alive.best/o/737ac96dc69ba883/v/orig.webp
enabled: true
---

# Auto-Scrolling Carousel

Smooth auto-scrolling carousel that continuously moves images from right to left in an infinite loop. Perfect for showcasing image galleries with a modern, hands-free scrolling experience.

## Implementation

Create an auto-scrolling carousel that automatically moves images infinitely:

### Files to create:

- `components/MovingCarousel.tsx` - Auto-scrolling carousel component

### How It Works:

**The Auto-Scroll Mechanism:**
1. Images array is duplicated 3 times: `[...images, ...images, ...images]`
2. CSS `transform: translateX(offset)` moves the container left smoothly
3. JavaScript interval (50ms) decrements offset by 1 pixel continuously
4. When images flow off-screen, the 3x duplication creates a seamless loop effect
5. Animation runs automatically on mount and never stops

**Component Structure:**
```typescript
const [offset, setOffset] = useState(0)

useEffect(() => {
  const interval = setInterval(() => {
    setOffset(prev => prev - 1)  // Move left by 1px every 50ms
  }, 50)
  return () => clearInterval(interval)
}, [])

// Render with transform
<div style={{ transform: `translateX(${offset}px)` }}>
  {[...images, ...images, ...images].map(...)}
</div>
```

### Core Requirements (Auto-Scroller):

- **Automatic scrolling** - starts immediately on component mount
- **Continuous motion** - never stops, loops infinitely
- **Smooth animation** - uses CSS transform for GPU acceleration
- **No user interaction required** - hands-free scrolling
- **Seamless loop** - no visible jumps when restarting
- **Each slide** takes 55vw (viewport width) of space
- **Gap between slides** - 8px spacing
- **Image sizing** - fixed height (h-96) with object-cover
- **Lazy loading** - native lazy attribute on images
- **Responsive** - adapts to viewport width changes
- **Performance** - smooth 60fps with no jank

### Technical Stack:

```typescript
// Pure React implementation
- useState for offset state
- useEffect for animation interval
- CSS transform: translateX() for smooth scrolling
- Flex layout for image arrangement
- No external carousel libraries needed
```

### Why This Approach:

✅ No dependencies - pure React & CSS
✅ GPU-accelerated transforms - smooth performance
✅ 50ms interval timing - creates fluid motion
✅ 3x image duplication - seamless infinite loop
✅ Lightweight - minimal JavaScript overhead
