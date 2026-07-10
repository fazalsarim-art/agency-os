import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { planForPriceId } from '@/lib/plans'

// Map Stripe's subscription status to our subscriptions.status enum.
function mapStatus(s: Stripe.Subscription.Status): string {
  switch (s) {
    case 'active':
      return 'active'
    case 'trialing':
      return 'trialing'
    case 'past_due':
    case 'unpaid':
      return 'past_due'
    case 'incomplete':
      return 'incomplete'
    default:
      // canceled, incomplete_expired, paused → treat as canceled
      return 'canceled'
  }
}

// current_period_end may live on the subscription or (in newer API versions) on
// the first item — read defensively.
function periodEnd(sub: Stripe.Subscription): string | null {
  const s = sub as unknown as {
    current_period_end?: number
    items?: { data?: Array<{ current_period_end?: number }> }
  }
  const ts = s.current_period_end ?? s.items?.data?.[0]?.current_period_end
  return ts ? new Date(ts * 1000).toISOString() : null
}

// Upsert the org's subscription row from a Stripe subscription object.
async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  const orgId = sub.metadata?.organization_id
  if (!orgId) {
    console.error('[stripe] subscription %s has no organization_id metadata', sub.id)
    return
  }
  const priceId = sub.items.data[0]?.price?.id
  const plan = planForPriceId(priceId) ?? 'free'

  const admin = createAdminClient()
  const { error } = await admin.from('subscriptions').upsert(
    {
      organization_id: orgId,
      stripe_customer_id:
        typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
      stripe_subscription_id: sub.id,
      plan,
      status: mapStatus(sub.status),
      current_period_end: periodEnd(sub),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id' }
  )
  if (error) console.error('[stripe] failed to sync subscription:', error.message)
}

export async function POST(request: Request) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!sig || !webhookSecret) {
    return new Response('Missing signature or webhook secret', { status: 400 })
  }

  let event: Stripe.Event
  try {
    // The webhook — not the success redirect — is the source of truth. We only
    // trust events whose signature we can verify against our webhook secret.
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret)
  } catch (err) {
    console.error('[stripe] signature verification failed:', err)
    return new Response('Invalid signature', { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(
            session.subscription as string
          )
          await syncSubscription(sub)
        }
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        await syncSubscription(event.data.object as Stripe.Subscription)
        break
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const orgId = sub.metadata?.organization_id
        if (orgId) {
          const admin = createAdminClient()
          await admin
            .from('subscriptions')
            .update({
              plan: 'free',
              status: 'canceled',
              stripe_subscription_id: null,
              current_period_end: null,
              updated_at: new Date().toISOString(),
            })
            .eq('organization_id', orgId)
        }
        break
      }
      default:
        // Ignore unrelated events.
        break
    }
  } catch (err) {
    console.error('[stripe] error handling event %s:', event.type, err)
    return new Response('Handler error', { status: 500 })
  }

  return Response.json({ received: true })
}
