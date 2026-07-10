import Stripe from 'stripe'

// Server-only Stripe client. NEVER import this into a client component — it
// carries the secret key. Uses the SDK's pinned API version.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  typescript: true,
})
