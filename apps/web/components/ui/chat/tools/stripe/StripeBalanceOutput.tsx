interface StripeBalanceOutputProps {
  balance: any
}

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100)
}

export function StripeBalanceOutput({ balance }: StripeBalanceOutputProps) {
  if (!balance) {
    return <div className="text-sm text-black/50 dark:text-white/50 py-2">No balance data</div>
  }

  const available = balance.available?.[0]
  const instantAvailable = balance.instant_available?.[0]
  const pending = balance.pending?.[0]

  const currency = available?.currency || instantAvailable?.currency || pending?.currency || "eur"

  return (
    <div className="grid grid-cols-3 gap-3">
      {/* Available Balance */}
      <div className="border border-black/10 dark:border-white/10 rounded-lg p-4 bg-black/[0.01] dark:bg-white/[0.01]">
        <div className="text-[10px] uppercase tracking-wider text-black/50 dark:text-white/50 font-medium mb-2">
          Available
        </div>
        <div className="text-2xl font-semibold text-black/90 dark:text-white/90 mb-1">
          {available ? formatAmount(available.amount, currency) : "—"}
        </div>
        <div className="text-xs text-black/40 dark:text-white/40">Ready to use now</div>
      </div>

      {/* Instant Available */}
      <div className="border border-green-200 dark:border-green-900/30 rounded-lg p-4 bg-green-50 dark:bg-green-900/10">
        <div className="text-[10px] uppercase tracking-wider text-green-700 dark:text-green-400 font-medium mb-2">
          Instant
        </div>
        <div className="text-2xl font-semibold text-green-800 dark:text-green-300 mb-1">
          {instantAvailable ? formatAmount(instantAvailable.amount, currency) : "—"}
        </div>
        <div className="text-xs text-green-600/70 dark:text-green-400/70">Transfer instantly</div>
      </div>

      {/* Pending */}
      <div className="border border-blue-200 dark:border-blue-900/30 rounded-lg p-4 bg-blue-50 dark:bg-blue-900/10">
        <div className="text-[10px] uppercase tracking-wider text-blue-700 dark:text-blue-400 font-medium mb-2">
          Pending
        </div>
        <div className="text-2xl font-semibold text-blue-800 dark:text-blue-300 mb-1">
          {pending ? formatAmount(pending.amount, currency) : "—"}
        </div>
        <div className="text-xs text-blue-600/70 dark:text-blue-400/70">Processing</div>
      </div>
    </div>
  )
}
