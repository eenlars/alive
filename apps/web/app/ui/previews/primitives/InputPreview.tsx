"use client"

import { Check, Loader2 } from "lucide-react"
import { useState } from "react"
import { Input } from "@/components/ui/primitives/Input"

export function InputPreview() {
  const [value, setValue] = useState("")

  return (
    <div className="space-y-8 max-w-md">
      {/* Basic */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Basic</h3>
        <Input placeholder="Enter your name..." value={value} onChange={e => setValue(e.target.value)} />
      </section>

      {/* With Label */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">With Label</h3>
        <Input label="Email Address" placeholder="you@example.com" type="email" />
      </section>

      {/* With Helper Text */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">With Helper Text</h3>
        <Input
          label="Username"
          helperText="Your username will be visible to other users"
          placeholder="Choose a username..."
        />
      </section>

      {/* States */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">States</h3>
        <div className="space-y-4">
          <Input label="Default State" placeholder="Default input..." state="default" />
          <Input label="Success State" value="valid@example.com" state="success" successMessage="Email is valid" />
          <Input label="Error State" value="invalid" state="error" errorMessage="Please enter a valid email address" />
          <Input label="Loading State" value="checking..." state="loading" />
        </div>
      </section>

      {/* With Suffix */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">With Suffix</h3>
        <div className="space-y-4">
          <Input
            placeholder="Validating..."
            suffix={<Loader2 size={16} className="animate-spin text-black/40 dark:text-white/40" />}
          />
          <Input placeholder="Confirmed" suffix={<Check size={16} className="text-green-500" />} />
        </div>
      </section>

      {/* Disabled */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Disabled</h3>
        <Input label="Disabled Input" value="Cannot edit this" disabled />
      </section>
    </div>
  )
}
