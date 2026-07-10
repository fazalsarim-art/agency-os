'use server'

import { requireOrgMembership } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasPermission } from '@/lib/permissions'
import { getPlan, type PlanId } from '@/lib/plans'
import { stripe } from '@/lib/stripe'

export type BillingActionResult = { error: string } | { url: string }

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

// Finds the org's existing Stripe customer id, or creates a customer and
// stores it. Uses the admin client because subscriptions has no authenticated
// write policy (only the trusted backend writes billing rows).
async function getOrCreateCustomer(
  orgId: string,
  email: string | undefined
): Promise<string> {
  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('organization_id', orgId)
    .maybeSingle()

  if (existing?.stripe_customer_id) return existing.stripe_customer_id

  const customer = await stripe.customers.create({
    email,
    metadata: { organization_id: orgId },
  })

  await admin
    .from('subscriptions')
    .upsert(
      { organization_id: orgId, stripe_customer_id: customer.id },
      { onConflict: 'organization_id' }
    )

  return customer.id
}

// Starts a Stripe Checkout session for the chosen paid plan.
export async function createCheckoutSession(
  orgSlug: string,
  planId: string
): Promise<BillingActionResult> {
  const { user, organization, role } = await requireOrgMembership(orgSlug)
  if (!hasPermission(role, 'billing:manage')) {
    return { error: 'Only owners can manage billing.' }
  }

  const plan = getPlan(planId)
  if (!plan.priceId) {
    return { error: `The ${plan.name} plan is not available for checkout.` }
  }

  const customerId = await getOrCreateCustomer(organization.id, user.email)

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: plan.priceId, quantity: 1 }],
    success_url: `${appUrl}/dashboard/${orgSlug}/billing?checkout=success`,
    cancel_url: `${appUrl}/dashboard/${orgSlug}/billing?checkout=canceled`,
    metadata: { organization_id: organization.id, plan: plan.id satisfies PlanId },
    subscription_data: { metadata: { organization_id: organization.id } },
  })

  if (!session.url) return { error: 'Could not start checkout. Please try again.' }
  return { url: session.url }
}

// Opens the Stripe billing portal so the owner can manage/cancel the plan.
export async function createPortalSession(
  orgSlug: string
): Promise<BillingActionResult> {
  const { organization, role } = await requireOrgMembership(orgSlug)
  if (!hasPermission(role, 'billing:manage')) {
    return { error: 'Only owners can manage billing.' }
  }

  const admin = createAdminClient()
  const { data: sub } = await admin
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('organization_id', organization.id)
    .maybeSingle()

  if (!sub?.stripe_customer_id) {
    return { error: 'No billing account yet — upgrade to a paid plan first.' }
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${appUrl}/dashboard/${orgSlug}/billing`,
  })

  return { url: session.url }
}
