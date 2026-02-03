"use client"

import { ArrowRight, Check, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/primitives/Button"

export function ButtonPreview() {
  return (
    <div className="space-y-8">
      {/* Variants */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Variants</h3>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary">Primary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
        </div>
      </section>

      {/* Sizes */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Sizes</h3>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </div>
      </section>

      {/* With Icons */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">With Icons</h3>
        <div className="flex flex-wrap gap-3">
          <Button icon={<Check size={16} />}>Confirm</Button>
          <Button icon={<ArrowRight size={16} />} iconPosition="right">
            Continue
          </Button>
          <Button variant="destructive" icon={<Trash2 size={16} />}>
            Delete
          </Button>
        </div>
      </section>

      {/* States */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">States</h3>
        <div className="flex flex-wrap gap-3">
          <Button>Default</Button>
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
        </div>
      </section>

      {/* Full Width */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Full Width</h3>
        <div className="max-w-sm">
          <Button fullWidth>Full Width Button</Button>
        </div>
      </section>
    </div>
  )
}
