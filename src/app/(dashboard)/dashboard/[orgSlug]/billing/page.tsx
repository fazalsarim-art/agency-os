import { requireOrgMembership } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { hasPermission } from '@/lib/permissions'
import { PLANS, PLAN_ORDER, getPlan } from '@/lib/plans'
import { BillingPlans, type PlanCard } from './billing-plans'

export default async function BillingPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ checkout?: string | string[] }>
}) {
  const { orgSlug } = await params
  const sp = await searchParams
  const { organization, role } = await requireOrgMembership(orgSlug)

  if (!hasPermission(role, 'billing:manage')) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Only owners can manage billing.
        </p>
      </div>
    )
  }

  const supabase = await createClient()
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan, status, current_period_end')
    .eq('organization_id', organization.id)
    .maybeSingle()

  const currentPlan = getPlan(sub?.plan)
  const status = (sub?.status as string) ?? 'active'
  const isSubscribed = currentPlan.id !== 'free'
  const checkoutResult = Array.isArray(sp.checkout) ? sp.checkout[0] : sp.checkout

  // Only pass client-safe display data (no Stripe price ids).
  const plans: PlanCard[] = PLAN_ORDER.map((id) => {
    const p = PLANS[id]
    return {
      id: p.id,
      name: p.name,
      priceMonthly: p.priceMonthly,
      features: p.features,
      available: p.id === 'free' || !!p.priceId,
    }
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-muted-foreground text-sm">
          Manage {organization.name}’s plan and subscription.
        </p>
      </div>

      {checkoutResult === 'success' && (
        <p className="text-sm rounded-md bg-green-100 text-green-800 p-3">
          Payment received — your plan will update here shortly (confirmed by
          Stripe webhook).
        </p>
      )}
      {checkoutResult === 'canceled' && (
        <p className="text-sm rounded-md bg-muted p-3 text-muted-foreground">
          Checkout canceled — no changes were made.
        </p>
      )}

      <div className="border rounded-lg p-4">
        <p className="text-sm text-muted-foreground">Current plan</p>
        <p className="text-lg font-semibold">
          {currentPlan.name}{' '}
          <span className="text-sm font-normal text-muted-foreground">
            ({status})
          </span>
        </p>
      </div>

      <BillingPlans
        orgSlug={orgSlug}
        currentPlanId={currentPlan.id}
        isSubscribed={isSubscribed}
        plans={plans}
      />
    </div>
  )
}
