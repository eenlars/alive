interface StripeAccountOutputProps {
  account: any
}

export function StripeAccountOutput({ account }: StripeAccountOutputProps) {
  if (!account) {
    return <div className="text-sm text-black/50 dark:text-white/50 py-2">No account data</div>
  }

  return (
    <div className="border border-black/10 dark:border-white/10 rounded-lg p-4 bg-black/[0.01] dark:bg-white/[0.01]">
      <div className="flex items-baseline gap-3">
        <div className="text-lg font-semibold text-black/90 dark:text-white/90">
          {account.display_name || "Stripe Account"}
        </div>
        {account.account_id && (
          <div className="text-xs font-mono text-black/40 dark:text-white/40">
            <a
              href={"https://dashboard.stripe.com/settings/account"}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-600 dark:hover:text-blue-400"
            >
              {account.account_id}
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
