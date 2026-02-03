/**
 * Fake Stripe data for previews and testing
 *
 * Shared between component tests and preview-ui.
 */

export const FAKE_STRIPE_CUSTOMERS = [
  {
    id: "cus_ABC123",
    name: "Acme Corporation",
    email: "billing@example.com",
    created: Math.floor(Date.now() / 1000) - 90 * 24 * 60 * 60,
    balance: 0,
    currency: "usd",
    delinquent: false,
  },
  {
    id: "cus_DEF456",
    name: "TechStart Inc",
    email: "finance@example.com",
    created: Math.floor(Date.now() / 1000) - 45 * 24 * 60 * 60,
    balance: -5000,
    currency: "usd",
    delinquent: false,
  },
  {
    id: "cus_GHI789",
    name: "Global Services Ltd",
    email: "accounts@example.com",
    created: Math.floor(Date.now() / 1000) - 180 * 24 * 60 * 60,
    balance: 15000,
    currency: "eur",
    delinquent: true,
  },
  {
    id: "cus_JKL012",
    name: null,
    email: "john.doe@example.com",
    created: Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60,
    balance: 0,
    currency: "usd",
    delinquent: false,
  },
]

export const FAKE_STRIPE_ACCOUNT = {
  account_id: "acct_1234567890",
  display_name: "Acme Corporation",
  email: "billing@example.com",
  country: "US",
  default_currency: "usd",
}

export const FAKE_STRIPE_ACCOUNT_MINIMAL = {
  account_id: "acct_0987654321",
  display_name: null,
}
