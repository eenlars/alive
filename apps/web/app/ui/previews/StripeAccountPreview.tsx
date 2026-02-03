/**
 * Stripe Account Preview
 *
 * Preview for StripeAccountOutput component.
 * Uses shared fake data so edits to component are reflected immediately.
 */

"use client"

import { RotateCcw } from "lucide-react"
import { useState } from "react"
import { FAKE_STRIPE_ACCOUNT, FAKE_STRIPE_ACCOUNT_MINIMAL } from "@/components/ui/chat/tools/stripe/fake-data"
import { StripeAccountOutput } from "@/components/ui/chat/tools/stripe/StripeAccountOutput"

type AccountType = "full" | "minimal" | "empty"

type StripeAccount = typeof FAKE_STRIPE_ACCOUNT | typeof FAKE_STRIPE_ACCOUNT_MINIMAL | null

const ACCOUNTS: Record<AccountType, StripeAccount> = {
  full: FAKE_STRIPE_ACCOUNT,
  minimal: FAKE_STRIPE_ACCOUNT_MINIMAL,
  empty: null,
}

export function StripeAccountPreview() {
  const [accountType, setAccountType] = useState<AccountType>("full")

  const account = ACCOUNTS[accountType]

  const reset = () => {
    setAccountType("full")
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">StripeAccountOutput</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Account info display with link to Stripe dashboard.
        </p>
      </div>

      <div className="flex flex-col-reverse md:flex-row gap-6 md:gap-8">
        <div className="flex-1 md:max-w-xl">
          <StripeAccountOutput account={account} />
        </div>

        <div className="w-full md:w-48 space-y-4">
          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
            <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
              Account
            </h3>
            <div className="space-y-1.5">
              {[
                { id: "full", label: "Full details" },
                { id: "minimal", label: "Minimal" },
                { id: "empty", label: "No data" },
              ].map(type => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setAccountType(type.id as AccountType)}
                  className={`w-full text-left px-2 py-1.5 text-xs font-medium rounded transition-colors ${
                    accountType === type.id
                      ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                  }`}
                >
                  {type.label}
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
