---
name: Minimal Testimonials Slider
description: Elegant testimonial carousel with avatar selection and smooth fade transitions
category: ui-components
complexity: 2
files: 1
estimatedTime: "10 min"
dependencies:
  - next/image
tags:
  - testimonials
  - carousel
  - avatars
  - social-proof
previewImage: https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&h=600&fit=crop
enabled: true
---

You are given a task to integrate an existing React component in the codebase

The codebase should support:
- shadcn project structure  
- Tailwind CSS
- Typescript

If it doesn't, provide instructions on how to setup project via shadcn CLI, install Tailwind or Typescript.

Determine the default path for components and styles. 
If default path for components is not /components/ui, provide instructions on why it's important to create this folder
Copy-paste this component to /components/ui folder:
```tsx
minimal-testimonial.tsx
"use client"

import { useState } from "react"
import Image from "next/image"

const testimonials = [
  {
    quote: "Working with them transformed our entire brand identity. The attention to detail was exceptional.",
    name: "Sarah Chen",
    role: "CEO at Stripe",
    image: "https://images.unsplash.com/photo-1701615004837-40d8573b6652?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NDB8fGF2YXRhcnN8ZW58MHx8MHx8fDA%3D$0",
  },
  {
    quote: "A rare talent who combines strategic thinking with flawless execution. Highly recommended.",
    name: "Marcus Johnson",
    role: "Design Lead at Linear",
    image: "https://images.unsplash.com/photo-1639149888905-fb39731f2e6c?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NDN8fGF2YXRhcnN8ZW58MHx8MHx8fDA%3D$0",
  },
  {
    quote: "The most seamless collaboration I've experienced. They truly understand modern design.",
    name: "Elena Voss",
    role: "Founder at Notion",
    image: "https://plus.unsplash.com/premium_photo-1689977830819-d00b3a9b7363?w=900&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8NTJ8fGF2YXRhcnN8ZW58MHx8MHx8fDA%3D$0",
  },
]

export function TestimonialsMinimal() {
  const [active, setActive] = useState(0)

  return (
    <div className="w-full max-w-xl mx-auto px-6 py-16">
      {/* Quote */}
      <div className="relative min-h-[80px] mb-12">
        {testimonials.map((t, i) => (
          <p
            key={i}
            className={`
              absolute inset-0 text-xl md:text-2xl font-light leading-relaxed text-foreground
              transition-all duration-500 ease-out
              ${
                active === i
                  ? "opacity-100 translate-y-0 blur-0"
                  : "opacity-0 translate-y-4 blur-sm pointer-events-none"
              }
            `}
          >
            "{t.quote}"
          </p>
        ))}
      </div>

      {/* Author Row */}
      <div className="flex items-center gap-6">
        {/* Avatars */}
        <div className="flex -space-x-2">
          {testimonials.map((t, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`
                relative w-10 h-10 rounded-full overflow-hidden ring-2 ring-background
                transition-all duration-300 ease-out
                ${active === i ? "z-10 scale-110" : "grayscale hover:grayscale-0 hover:scale-105"}
              `}
            >
              <Image src={t.image || "/placeholder.svg"} alt={t.name} fill className="object-cover" />
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="h-8 w-px bg-border" />

        {/* Active Author Info */}
        <div className="relative flex-1 min-h-[44px]">
          {testimonials.map((t, i) => (
            <div
              key={i}
              className={`
                absolute inset-0 flex flex-col justify-center
                transition-all duration-400 ease-out
                ${active === i ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2 pointer-events-none"}
              `}
            >
              <span className="text-sm font-medium text-foreground">{t.name}</span>
              <span className="text-xs text-muted-foreground">{t.role}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}


demo.tsx
import { TestimonialsMinimal } from "@/components/ui/minimal-testimonial"

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-8 w-full">
      <TestimonialsMinimal />
    </main>
  )
}

```

Install NPM dependencies:
```bash
next
```

Implementation Guidelines
 1. Analyze the component structure and identify all required dependencies
 2. Review the component's argumens and state
 3. Identify any required context providers or hooks and install them
 4. Questions to Ask
 - What data/props will be passed to this component?
 - Are there any specific state management requirements?
 - Are there any required assets (images, icons, etc.)?
 - What is the expected responsive behavior?
 - What is the best place to use this component in the app?

Steps to integrate
 0. Copy paste all the code above in the correct directories
 1. Install external dependencies
 2. Fill image assets with Unsplash stock images you know exist
 3. Use lucide-react icons for svgs or logos if component requires them
