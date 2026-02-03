interface StripeSearchOutputProps {
  results: any[]
}

function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100)
}

// Extract amount and currency from text like "amount 296 and currency eur"
function parseAmountFromText(text: string): { amount: number; currency: string } | null {
  const match = text.match(/amount (\d+) and currency (\w+)/)
  if (match) {
    return {
      amount: parseInt(match[1], 10),
      currency: match[2],
    }
  }
  return null
}

// Extract resource type from title
function getResourceType(title: string, id: string): string {
  // Check ID prefix to determine type
  if (id.startsWith("pi_")) return "Payment"
  if (id.startsWith("sub_")) return "Subscription"
  if (id.startsWith("cus_")) return "Customer"
  if (id.startsWith("in_")) return "Invoice"
  if (id.startsWith("ch_")) return "Charge"

  // Fallback to title
  if (title.includes("Subscription")) return "Subscription"
  if (title.includes("Payment")) return "Payment"
  if (title.includes("Customer")) return "Customer"
  if (title.includes("Invoice")) return "Invoice"

  return "Resource"
}

export function StripeSearchOutput({ results }: StripeSearchOutputProps) {
  if (!results || results.length === 0) {
    return <div className="text-sm text-black/50 dark:text-white/50 py-2">No results found</div>
  }

  return (
    <div className="space-y-2">
      {/* Result count */}
      <div className="text-xs text-black/50 dark:text-white/50">
        Found {results.length} result{results.length !== 1 ? "s" : ""}
      </div>

      {/* Search results table */}
      <div className="border border-black/10 dark:border-white/10 overflow-x-auto max-h-96 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="bg-black/[0.02] dark:bg-white/[0.02] sticky top-0 z-10">
            <tr className="border-b border-black/10 dark:border-white/10">
              <th className="text-left px-3 py-2 font-medium text-black/60 dark:text-white/60">Result</th>
              <th className="text-left px-3 py-2 font-medium text-black/60 dark:text-white/60">Type</th>
              <th className="text-right px-3 py-2 font-medium text-black/60 dark:text-white/60">Amount</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result, index) => {
              const amountData = parseAmountFromText(result.text || "")
              const resourceType = getResourceType(result.title || "", result.id || "")

              return (
                <tr
                  key={result.id || `result-${index}`}
                  className={`border-b border-black/5 dark:border-white/5 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors ${
                    index % 2 === 0 ? "bg-black/[0.01] dark:bg-white/[0.01]" : ""
                  }`}
                >
                  <td className="px-3 py-2">
                    <div className="text-black/70 dark:text-white/70 font-medium mb-0.5">
                      {result.title || "Result"}
                    </div>
                    {result.id && (
                      <div className="font-mono text-[10px] text-black/40 dark:text-white/40">
                        <a
                          href={result.url || "https://dashboard.stripe.com"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-blue-600 dark:hover:text-blue-400"
                        >
                          {result.id}
                        </a>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-black/5 dark:bg-white/5 text-black/70 dark:text-white/70">
                      {resourceType}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {amountData ? (
                      <div className="font-semibold text-black/80 dark:text-white/80">
                        {formatAmount(amountData.amount, amountData.currency)}
                      </div>
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
    </div>
  )
}
