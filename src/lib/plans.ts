// Plan catalog for AgencyOS billing.
//
// Prices are Stripe test-mode prices. The `priceId` values come from env vars
// (server-only — never expose these to the client). Limits are displayed on the
// billing page now; server-side enforcement lands in the org-settings stage.

export type PlanId = 'free' | 'pro' | 'business'

export type PlanLimits = {
  clients: number // Infinity = unlimited
  projects: number
  members: number
}

export type Plan = {
  id: PlanId
  name: string
  priceMonthly: number // USD, display only
  priceId: string | null // Stripe price id (null for Free)
  limits: PlanLimits
  features: string[]
}

export const UNLIMITED = Infinity

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    name: 'Free',
    priceMonthly: 0,
    priceId: null,
    limits: { clients: 3, projects: 3, members: 3 },
    features: ['Up to 3 clients', 'Up to 3 projects', 'Up to 3 members'],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceMonthly: 20,
    priceId: process.env.STRIPE_PRO_PRICE_ID ?? null,
    limits: { clients: UNLIMITED, projects: UNLIMITED, members: 10 },
    features: [
      'Unlimited clients',
      'Unlimited projects',
      'Up to 10 members',
      'Audit logs',
    ],
  },
  business: {
    id: 'business',
    name: 'Business',
    priceMonthly: 50,
    priceId: process.env.STRIPE_BUSINESS_PRICE_ID ?? null,
    limits: { clients: UNLIMITED, projects: UNLIMITED, members: UNLIMITED },
    features: ['Everything in Pro', 'Unlimited members', 'Priority support'],
  },
}

export const PLAN_ORDER: PlanId[] = ['free', 'pro', 'business']

export function getPlan(planId: string | null | undefined): Plan {
  return PLANS[(planId as PlanId) ?? 'free'] ?? PLANS.free
}

// Maps a Stripe price id back to a plan id (used by the webhook). Server-only,
// because it reads the non-public price-id env vars.
export function planForPriceId(priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null
  if (PLANS.pro.priceId && priceId === PLANS.pro.priceId) return 'pro'
  if (PLANS.business.priceId && priceId === PLANS.business.priceId) return 'business'
  return null
}

export function formatLimit(n: number): string {
  return n === UNLIMITED ? 'Unlimited' : String(n)
}
