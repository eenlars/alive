---
name: Interactive Hero Background
description: Subtle WebGL background with mouse interaction. Tailor the effect to match the brand - flow fields, dot grids, wireframes, or something unique.
category: components
complexity: 3
files: 6
dependencies:
  - "@react-three/fiber@8.17.10"
  - "@react-three/drei@9.117.3"
  - "three@0.169.0"
estimatedTime: 15-20 minutes
estimatedTokens: 85
tags: [react, three.js, webgl, particles, hero, background, animation]
requires:
  - React 18+
  - TypeScript
previewImage: https://app.alive.best/_images/t/alive.best/o/50485d47136b4c28/v/orig.webp
enabled: true
---

# Interactive Hero Background

A subtle, performant WebGL background that reacts to mouse movement. The effect should be **tailored to the brand** - this template provides the technical foundation and inspiration, not a one-size-fits-all solution.

**IMPORTANT: This is a 2D effect only.** All particles move on a flat plane (X/Y axis). No 3D depth, rotation, or perspective. The camera is fixed orthogonally. This keeps it subtle and performant as a background.

## Choose Your Effect

Pick the style that matches the brand personality:

| Effect | Vibe | Best For |
|--------|------|----------|
| **Neural Streamlines** | Flow field particles like wind/water | AI, Fintech, speed-focused SaaS |
| **Data Topography** | Wireframe mesh that lifts toward mouse | Infrastructure, platforms, developer tools |
| **Kinetic ASCII** | Code characters that scramble on hover | Developer tools, hacker aesthetic |
| **Dot Grid Repulsion** | Classic dots pushed away by mouse | Clean, minimal, any startup |
| **Gradient Blobs** | Soft color blobs that drift and merge | Creative, design, lifestyle brands |

**Or invent something new** - these are starting points. Consider:
- What does the brand represent? Speed? Trust? Innovation? Creativity?
- What colors define the brand?
- Should it feel technical or organic? Sharp or soft?
- What emotion should visitors feel?

## Implementation

### Files to create:

```
components/
  hero-background/
    index.tsx              # Export
    HeroBackground.tsx     # Main component
    FlowField.tsx          # Particle system
    shaders.ts             # GLSL shaders
    hooks/
      useFlowField.ts      # Flow field physics
      useMousePosition.ts  # Normalized mouse
```

### Step 1: Install Dependencies

```bash
pnpm add @react-three/fiber@8.17.10 @react-three/drei@9.117.3 three@0.169.0
pnpm add -D @types/three
```

**CRITICAL:** Do NOT use @react-three/fiber 9.x - it has a breaking bug ("Cannot read 'S'").

### Step 2: Create Mouse Position Hook

**File: `components/hero-background/hooks/useMousePosition.ts`**

```typescript
import { useEffect, useRef } from 'react'
import { Vector2 } from 'three'

export function useMousePosition() {
  const mouse = useRef(new Vector2(0, 0))
  const target = useRef(new Vector2(0, 0))

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Normalize to -1 to 1
      target.current.x = (e.clientX / window.innerWidth) * 2 - 1
      target.current.y = -(e.clientY / window.innerHeight) * 2 + 1
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        target.current.x = (e.touches[0].clientX / window.innerWidth) * 2 - 1
        target.current.y = -(e.touches[0].clientY / window.innerHeight) * 2 + 1
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('touchmove', handleTouchMove)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('touchmove', handleTouchMove)
    }
  }, [])

  return { mouse, target }
}
```

### Step 3: Create Flow Field Hook

**File: `components/hero-background/hooks/useFlowField.ts`**

```typescript
import { useMemo } from 'react'
import { Vector3 } from 'three'

interface FlowFieldOptions {
  count: number
  bounds: { x: number; y: number }
  speed: number
}

export function useFlowField({ count, bounds, speed }: FlowFieldOptions) {
  return useMemo(() => {
    const positions = new Float32Array(count * 3)
    const velocities = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const sizes = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      const i3 = i * 3

      // Random starting position
      positions[i3] = (Math.random() - 0.5) * bounds.x * 2
      positions[i3 + 1] = (Math.random() - 0.5) * bounds.y * 2
      positions[i3 + 2] = (Math.random() - 0.5) * 2

      // Initial velocity (flowing right)
      velocities[i3] = speed * (0.5 + Math.random() * 0.5)
      velocities[i3 + 1] = (Math.random() - 0.5) * speed * 0.2
      velocities[i3 + 2] = 0

      // Gradient colors (blue to purple)
      const t = Math.random()
      colors[i3] = 0.23 + t * 0.31     // R: 59 -> 139
      colors[i3 + 1] = 0.51 - t * 0.15  // G: 130 -> 92
      colors[i3 + 2] = 0.96             // B: 246

      // Random sizes
      sizes[i] = 0.5 + Math.random() * 1.5
    }

    return { positions, velocities, colors, sizes }
  }, [count, bounds.x, bounds.y, speed])
}
```

### Step 4: Create Shaders

**File: `components/hero-background/shaders.ts`**

```typescript
export const vertexShader = `
  attribute float size;
  attribute vec3 customColor;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vColor = customColor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

    // Fade based on depth
    vAlpha = smoothstep(-5.0, 0.0, mvPosition.z) * 0.6;

    gl_PointSize = size * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`

export const fragmentShader = `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    // Soft circle
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);
    float alpha = smoothstep(0.5, 0.2, dist) * vAlpha;

    if (alpha < 0.01) discard;

    gl_FragColor = vec4(vColor, alpha);
  }
`
```

### Step 5: Create Flow Field Component

**File: `components/hero-background/FlowField.tsx`**

```typescript
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Points, BufferGeometry, ShaderMaterial, Vector2 } from 'three'
import { useFlowField } from './hooks/useFlowField'
import { vertexShader, fragmentShader } from './shaders'

interface FlowFieldProps {
  count?: number
  mouse: React.RefObject<Vector2>
  target: React.RefObject<Vector2>
}

export function FlowField({ count = 5000, mouse, target }: FlowFieldProps) {
  const pointsRef = useRef<Points>(null)
  const geometryRef = useRef<BufferGeometry>(null)

  const bounds = { x: 10, y: 6 }
  const speed = 0.02
  const mouseRadius = 1.5
  const mouseStrength = 0.15

  const { positions, velocities, colors, sizes } = useFlowField({
    count,
    bounds,
    speed,
  })

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
      }),
    []
  )

  useFrame((_, delta) => {
    if (!geometryRef.current || !mouse.current || !target.current) return

    // Smooth mouse interpolation
    mouse.current.lerp(target.current, 0.1)

    const posAttr = geometryRef.current.attributes.position
    const posArray = posAttr.array as Float32Array

    for (let i = 0; i < count; i++) {
      const i3 = i * 3

      // Get current position
      let x = posArray[i3]
      let y = posArray[i3 + 1]
      let z = posArray[i3 + 2]

      // Calculate mouse influence
      const mouseX = mouse.current.x * bounds.x
      const mouseY = mouse.current.y * bounds.y
      const dx = x - mouseX
      const dy = y - mouseY
      const dist = Math.sqrt(dx * dx + dy * dy)

      // Apply mouse repulsion
      if (dist < mouseRadius && dist > 0.01) {
        const force = (1 - dist / mouseRadius) * mouseStrength
        const angle = Math.atan2(dy, dx)
        velocities[i3] += Math.cos(angle) * force
        velocities[i3 + 1] += Math.sin(angle) * force
      }

      // Apply base flow (right to left with slight wave)
      velocities[i3] += speed * 0.1
      velocities[i3 + 1] += Math.sin(x * 0.5 + Date.now() * 0.001) * 0.001

      // Apply velocity with damping
      x += velocities[i3]
      y += velocities[i3 + 1]
      z += velocities[i3 + 2]

      // Damping
      velocities[i3] *= 0.98
      velocities[i3 + 1] *= 0.98
      velocities[i3 + 2] *= 0.98

      // Wrap around bounds
      if (x > bounds.x) x = -bounds.x
      if (x < -bounds.x) x = bounds.x
      if (y > bounds.y) y = -bounds.y
      if (y < -bounds.y) y = bounds.y

      posArray[i3] = x
      posArray[i3 + 1] = y
      posArray[i3 + 2] = z
    }

    posAttr.needsUpdate = true
  })

  return (
    <points ref={pointsRef} material={material}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-customColor"
          count={count}
          array={colors}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-size"
          count={count}
          array={sizes}
          itemSize={1}
        />
      </bufferGeometry>
    </points>
  )
}
```

### Step 6: Create Main Component

**File: `components/hero-background/HeroBackground.tsx`**

```typescript
'use client'

import { Suspense, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { FlowField } from './FlowField'
import { useMousePosition } from './hooks/useMousePosition'

interface HeroBackgroundProps {
  colorScheme?: 'light' | 'dark'
  intensity?: number
  particleCount?: number
  className?: string
}

function Scene({ intensity = 0.6, particleCount }: { intensity: number; particleCount?: number }) {
  const { mouse, target } = useMousePosition()

  // Responsive particle count
  const count = useMemo(() => {
    if (particleCount) return particleCount
    if (typeof window === 'undefined') return 3000
    return window.innerWidth < 768 ? 2000 : 5000
  }, [particleCount])

  return (
    <FlowField
      count={Math.round(count * intensity)}
      mouse={mouse}
      target={target}
    />
  )
}

export function HeroBackground({
  colorScheme = 'dark',
  intensity = 0.6,
  particleCount,
  className = '',
}: HeroBackgroundProps) {
  const bgColor = colorScheme === 'dark' ? '#0a0a0a' : '#fafafa'

  return (
    <div className={`pointer-events-none ${className}`}>
      <Canvas
        camera={{ position: [0, 0, 5], fov: 75 }}
        style={{ background: bgColor }}
        dpr={[1, 2]}
        gl={{ antialias: false, alpha: false }}
      >
        <Suspense fallback={null}>
          <Scene intensity={intensity} particleCount={particleCount} />
        </Suspense>
      </Canvas>
    </div>
  )
}
```

### Step 7: Create Export

**File: `components/hero-background/index.tsx`**

```typescript
export { HeroBackground } from './HeroBackground'
export type { HeroBackgroundProps } from './HeroBackground'
```

### Step 8: Next.js Dynamic Import (Required for SSR)

For Next.js, create a wrapper with dynamic import:

**File: `components/hero-background/HeroBackgroundClient.tsx`**

```typescript
'use client'

import dynamic from 'next/dynamic'

export const HeroBackgroundClient = dynamic(
  () => import('./HeroBackground').then((mod) => mod.HeroBackground),
  { ssr: false }
)
```

## Usage

```tsx
import { HeroBackgroundClient } from '@/components/hero-background/HeroBackgroundClient'

export function Hero() {
  return (
    <section className="relative h-screen">
      <HeroBackgroundClient
        colorScheme="dark"
        intensity={0.6}
        className="absolute inset-0 -z-10"
      />
      <div className="relative z-10 flex items-center justify-center h-full">
        <h1 className="text-5xl font-bold text-white">Your Headline</h1>
      </div>
    </section>
  )
}
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `colorScheme` | `'light' \| 'dark'` | `'dark'` | Background color scheme |
| `intensity` | `number` | `0.6` | Effect intensity (0-1) |
| `particleCount` | `number` | auto | Override particle count |
| `className` | `string` | `''` | Container class for positioning |

## Performance Tuning

### For Slower Devices
```tsx
<HeroBackground intensity={0.4} particleCount={2000} />
```

### For High-End Displays
```tsx
<HeroBackground intensity={0.8} particleCount={8000} />
```

### Reduce Motion (Accessibility)
```tsx
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

<HeroBackground intensity={prefersReducedMotion ? 0.2 : 0.6} />
```

## Customizing Colors

Edit the `useFlowField.ts` hook, colors section:

```typescript
// Gradient from teal to pink
colors[i3] = 0.13 + t * 0.87     // R
colors[i3 + 1] = 0.83 - t * 0.42  // G
colors[i3 + 2] = 0.82 + t * 0.18  // B
```

## Troubleshooting

### "Cannot read properties of undefined (reading 'S')"
**Cause:** @react-three/fiber 9.x has a bug
**Fix:** Downgrade to 8.17.x:
```bash
pnpm add @react-three/fiber@8.17.10 @react-three/drei@9.117.3
```

### Blank screen on Next.js
**Cause:** SSR trying to access WebGL
**Fix:** Use dynamic import with `ssr: false`:
```tsx
const HeroBackground = dynamic(() => import('./HeroBackground'), { ssr: false })
```

### Low FPS / Stuttering
**Cause:** Too many particles or creating objects in render loop
**Fix:**
1. Reduce `particleCount`
2. Lower `intensity`
3. Ensure all arrays are created in `useMemo`, not in `useFrame`

### Mobile not responding
**Cause:** Touch events not handled
**Fix:** The `useMousePosition` hook includes touch support. Ensure it's imported correctly.

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 14+
- Edge 80+
- Mobile Safari (iOS 14+)
- Chrome Android

WebGL2 required. Falls back gracefully if not available.
