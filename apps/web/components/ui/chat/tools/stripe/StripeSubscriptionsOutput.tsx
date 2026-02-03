interface StripeSubscriptionsOutputProps {
  subscriptions: any[]
}

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100)
}

function formatInterval(interval: string, count: number): string {
  if (count === 1) return interval
  return `${count} ${interval}s`
}

function formatNextBilling(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  const now = new Date()
  const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return "Overdue"
  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Tomorrow"
  if (diffDays <= 7) return `In ${diffDays} days`

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export function StripeSubscriptionsOutput({ subscriptions }: StripeSubscriptionsOutputProps) {
  if (!subscriptions || subscriptions.length === 0) {
    return <div className="text-sm text-black/50 dark:text-white/50 py-2">No subscriptions found</div>
  }

  return (
    <div className="border border-black/10 dark:border-white/10 overflow-x-auto max-h-96 overflow-y-auto">
      <table className="w-full text-xs">
        <thead className="bg-black/[0.02] dark:bg-white/[0.02] sticky top-0 z-10">
          <tr className="border-b border-black/10 dark:border-white/10">
            <th className="text-left px-3 py-2 font-medium text-black/60 dark:text-white/60">Customer</th>
            <th className="text-left px-3 py-2 font-medium text-black/60 dark:text-white/60">Plan</th>
            <th className="text-right px-3 py-2 font-medium text-black/60 dark:text-white/60">Amount</th>
            <th className="text-left px-3 py-2 font-medium text-black/60 dark:text-white/60 whitespace-nowrap">
              Next Billing
            </th>
            <th className="text-left px-3 py-2 font-medium text-black/60 dark:text-white/60">Status</th>
          </tr>
        </thead>
        <tbody>
          {subscriptions.map((sub, index) => {
            const item = sub?.items?.data?.[0]
            const price = item?.price || item?.plan
            const amount = price?.unit_amount || price?.amount || 0
            const currency = sub?.currency || price?.currency || "eur"
            const interval = price?.recurring?.interval || price?.interval || "month"
            const intervalCount = price?.recurring?.interval_count || price?.interval_count || 1
            const nextBilling = sub?.current_period_end
            const planName = price?.nickname || price?.product || "Subscription"

            return (
              <tr
                key={sub?.id || `sub-${index}`}
                className={`border-b border-black/5 dark:border-white/5 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors ${
                  index % 2 === 0 ? "bg-black/[0.01] dark:bg-white/[0.01]" : ""
                }`}
              >
                <td className="px-3 py-2">
                  {sub?.customer ? (
                    <a
                      href={`https://dashboard.stripe.com/customers/${sub.customer}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-black/70 dark:text-white/70 hover:text-blue-600 dark:hover:text-blue-400 underline decoration-dotted"
                    >
                      {sub.customer}
                    </a>
                  ) : (
                    <span className="text-black/40 dark:text-white/40">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="text-black/70 dark:text-white/70 font-medium max-w-[200px] truncate">{planName}</div>
                  {sub?.id && (
                    <div className="font-mono text-[10px] text-black/40 dark:text-white/40">
                      <a
                        href={`https://dashboard.stripe.com/subscriptions/${sub.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        {sub.id}
                      </a>
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="font-semibold text-black/80 dark:text-white/80">{formatAmount(amount, currency)}</div>
                  <div className="text-black/50 dark:text-white/50 text-[10px]">
                    /{formatInterval(interval, intervalCount)}
                  </div>
                </td>
                <td className="px-3 py-2">
                  {nextBilling ? (
                    <div className="text-black/70 dark:text-white/70">{formatNextBilling(nextBilling)}</div>
                  ) : (
                    <span className="text-black/40 dark:text-white/40">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {sub?.status ? (
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        sub.status === "active"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : sub.status === "canceled"
                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            : sub.status === "trialing"
                              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                              : "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400"
                      }`}
                    >
                      {sub.status}
                    </span>
                  ) : (
                    <span className="text-black/40 dark:text-white/40">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
