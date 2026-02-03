"use client"

import { useState } from "react"
import { Modal } from "@/components/ui/Modal"
import { Button } from "@/components/ui/primitives/Button"

export function ModalPreview() {
  const [basicOpen, setBasicOpen] = useState(false)
  const [fullOpen, setFullOpen] = useState(false)
  const [smallOpen, setSmallOpen] = useState(false)

  return (
    <div className="space-y-8">
      {/* Basic Modal */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Basic Modal</h3>
        <Button onClick={() => setBasicOpen(true)}>Open Basic Modal</Button>
        <Modal
          isOpen={basicOpen}
          onClose={() => setBasicOpen(false)}
          title="Confirm Action"
          description="This action cannot be undone."
        >
          <div className="p-6 space-y-4">
            <p className="text-sm text-black/70 dark:text-white/70">
              Are you sure you want to proceed? This will permanently delete all your data.
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" onClick={() => setBasicOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => setBasicOpen(false)}>
                Delete
              </Button>
            </div>
          </div>
        </Modal>
      </section>

      {/* Small Modal */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Small Modal</h3>
        <Button onClick={() => setSmallOpen(true)}>Open Small Modal</Button>
        <Modal isOpen={smallOpen} onClose={() => setSmallOpen(false)} title="Quick Action" size="sm">
          <div className="p-6">
            <p className="text-sm text-black/70 dark:text-white/70 mb-4">A smaller modal for quick confirmations.</p>
            <Button fullWidth onClick={() => setSmallOpen(false)}>
              Got it
            </Button>
          </div>
        </Modal>
      </section>

      {/* Full Screen Modal */}
      <section>
        <h3 className="text-sm font-medium text-black/60 dark:text-white/60 mb-4">Full Screen Modal</h3>
        <Button onClick={() => setFullOpen(true)}>Open Full Screen Modal</Button>
        <Modal
          isOpen={fullOpen}
          onClose={() => setFullOpen(false)}
          title="Full Screen View"
          description="This modal takes up the entire screen"
          size="full"
        >
          <div className="p-6 flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-lg text-black/70 dark:text-white/70 mb-4">Full screen content area</p>
              <Button onClick={() => setFullOpen(false)}>Close</Button>
            </div>
          </div>
        </Modal>
      </section>
    </div>
  )
}
