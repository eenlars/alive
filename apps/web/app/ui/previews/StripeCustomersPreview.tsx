/**
 * Stripe Customers Preview
 *
 * Preview for StripeCustomersOutput component.
 * Uses shared fake data so edits to component are reflected immediately.
 */

"use client"

import { RotateCcw } from "lucide-react"
import { useState } from "react"
import { FAKE_STRIPE_CUSTOMERS } from "@/components/ui/chat/tools/stripe/fake-data"
import { StripeCustomersOutput } from "@/components/ui/chat/tools/stripe/StripeCustomersOutput"

export function StripeCustomersPreview() {
  const [customerCount, setCustomerCount] = useState(FAKE_STRIPE_CUSTOMERS.length)

  const customers = FAKE_STRIPE_CUSTOMERS.slice(0, customerCount)

  const reset = () => {
    setCustomerCount(FAKE_STRIPE_CUSTOMERS.length)
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">StripeCustomersOutput</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Table view of Stripe customers with balance and status.
        </p>
      </div>

      <div className="flex flex-col-reverse md:flex-row gap-6 md:gap-8">
        <div className="flex-1 md:max-w-2xl">
          <StripeCustomersOutput customers={customers} />
        </div>

        <div className="w-full md:w-48 space-y-4">
          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
            <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
              Customers
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {[0, 1, 2, FAKE_STRIPE_CUSTOMERS.length].map(count => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setCustomerCount(count)}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                    customerCount === count
                      ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                  }`}
                >
                  {count === 0 ? "Empty" : count}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={reset}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}
