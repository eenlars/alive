interface StripePaymentIntentsOutputProps {
  paymentIntents: any[]
}

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100)
}

export function StripePaymentIntentsOutput({ paymentIntents }: StripePaymentIntentsOutputProps) {
  if (!paymentIntents || paymentIntents.length === 0) {
    return <div className="text-sm text-black/50 dark:text-white/50 py-2">No payment intents found</div>
  }

  // Calculate summary stats
  const succeeded = paymentIntents.filter(pi => pi.status === "succeeded")
  const failed = paymentIntents.filter(
    pi => pi.status === "requires_payment_method" || pi.status === "failed" || pi.status === "canceled",
  )
  const processing = paymentIntents.filter(
    pi => pi.status === "processing" || pi.status === "requires_confirmation" || pi.status === "requires_action",
  )

  const totalSucceeded = succeeded.reduce((sum, pi) => sum + (pi.amount || 0), 0)
  const currency = paymentIntents[0]?.currency || "eur"

  return (
    <div className="space-y-3">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="border border-green-200 dark:border-green-900/30 rounded-md p-2 bg-green-50 dark:bg-green-900/10">
          <div className="text-[10px] uppercase tracking-wider text-green-700 dark:text-green-400 font-medium">
            Succeeded
          </div>
          <div className="text-lg font-semibold text-green-800 dark:text-green-300">{succeeded.length}</div>
          <div className="text-xs text-green-600/70 dark:text-green-400/70">
            {formatAmount(totalSucceeded, currency)}
          </div>
        </div>

        <div className="border border-red-200 dark:border-red-900/30 rounded-md p-2 bg-red-50 dark:bg-red-900/10">
          <div className="text-[10px] uppercase tracking-wider text-red-700 dark:text-red-400 font-medium">Failed</div>
          <div className="text-lg font-semibold text-red-800 dark:text-red-300">{failed.length}</div>
          <div className="text-xs text-red-600/70 dark:text-red-400/70">Needs attention</div>
        </div>

        <div className="border border-blue-200 dark:border-blue-900/30 rounded-md p-2 bg-blue-50 dark:bg-blue-900/10">
          <div className="text-[10px] uppercase tracking-wider text-blue-700 dark:text-blue-400 font-medium">
            Processing
          </div>
          <div className="text-lg font-semibold text-blue-800 dark:text-blue-300">{processing.length}</div>
          <div className="text-xs text-blue-600/70 dark:text-blue-400/70">In progress</div>
        </div>
      </div>

      {/* Payment Intents Table */}
      <div className="border border-black/10 dark:border-white/10 overflow-x-auto max-h-96 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="bg-black/[0.02] dark:bg-white/[0.02] sticky top-0 z-10">
            <tr className="border-b border-black/10 dark:border-white/10">
              <th className="text-left px-3 py-2 font-medium text-black/60 dark:text-white/60">Payment</th>
              <th className="text-left px-3 py-2 font-medium text-black/60 dark:text-white/60">Customer</th>
              <th className="text-right px-3 py-2 font-medium text-black/60 dark:text-white/60">Amount</th>
              <th className="text-left px-3 py-2 font-medium text-black/60 dark:text-white/60">Status</th>
            </tr>
          </thead>
          <tbody>
            {paymentIntents.map((pi, index) => {
              const isSuccess = pi.status === "succeeded"
              const isFailed =
                pi.status === "requires_payment_method" || pi.status === "failed" || pi.status === "canceled"
              const isProcessing = pi.status === "processing"

              return (
                <tr
                  key={pi.id || `pi-${index}`}
                  className={`border-b border-black/5 dark:border-white/5 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors ${
                    index % 2 === 0 ? "bg-black/[0.01] dark:bg-white/[0.01]" : ""
                  }`}
                >
                  <td className="px-3 py-2">
                    <div className="font-mono text-[10px] text-black/40 dark:text-white/40">
                      <a
                        href={`https://dashboard.stripe.com/payments/${pi.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        {pi.id}
                      </a>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {pi.customer ? (
                      <a
                        href={`https://dashboard.stripe.com/customers/${pi.customer}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-black/70 dark:text-white/70 hover:text-blue-600 dark:hover:text-blue-400 underline decoration-dotted"
                      >
                        {pi.customer}
                      </a>
                    ) : (
                      <span className="text-black/40 dark:text-white/40">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="font-semibold text-black/80 dark:text-white/80">
                      {formatAmount(pi.amount || 0, pi.currency || currency)}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        isSuccess
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : isFailed
                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            : isProcessing
                              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                              : "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400"
                      }`}
                    >
                      {pi.status}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
