import { createClient } from '@/lib/supabase/server'
import { PLANS, type PlanId } from '@/lib/plans'

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

export type LimitedResource = 'clients' | 'projects' | 'members'

const TABLE: Record<LimitedResource, string> = {
  clients: 'clients',
  projects: 'projects',
  members: 'organization_members',
}

// The org's effective plan. Only an active/trialing subscription counts as
// paid; anything else (none, canceled, past_due) falls back to Free so limits
// apply. Read via the caller's client (RLS lets members read their own sub).
export async function getOrgPlanId(
  supabase: SupabaseServer,
  orgId: string
): Promise<PlanId> {
  const { data } = await supabase
    .from('subscriptions')
    .select('plan, status')
    .eq('organization_id', orgId)
    .maybeSingle()
  if (data && (data.status === 'active' || data.status === 'trialing')) {
    return data.plan as PlanId
  }
  return 'free'
}

export type LimitCheck = {
  allowed: boolean
  current: number
  limit: number
  plan: PlanId
}

// Whether the org may create one more of `resource` under its current plan.
export async function checkLimit(
  supabase: SupabaseServer,
  orgId: string,
  resource: LimitedResource
): Promise<LimitCheck> {
  const plan = await getOrgPlanId(supabase, orgId)
  const limit = PLANS[plan].limits[resource]
  const { count } = await supabase
    .from(TABLE[resource])
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
  const current = count ?? 0
  return { allowed: current < limit, current, limit, plan }
}

// Friendly, actionable message shown when a create is blocked by the plan.
export function limitReachedMessage(resource: LimitedResource, plan: PlanId): string {
  return `You've reached your ${PLANS[plan].name} plan's limit of ${PLANS[plan].limits[resource]} ${resource}. Upgrade in Billing to add more.`
}
