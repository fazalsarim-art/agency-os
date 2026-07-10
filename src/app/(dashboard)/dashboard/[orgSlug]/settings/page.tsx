import { requireOrgMembership } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { hasPermission } from '@/lib/permissions'
import { getPlan } from '@/lib/plans'
import { SettingsForm } from './settings-form'

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const { organization, role } = await requireOrgMembership(orgSlug)

  if (!hasPermission(role, 'organization:manage')) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Only owners can manage organization settings.
        </p>
      </div>
    )
  }

  const supabase = await createClient()
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan, status')
    .eq('organization_id', organization.id)
    .maybeSingle()
  const plan = getPlan(sub?.plan)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm">
          Manage {organization.name}.
        </p>
      </div>

      <SettingsForm orgSlug={orgSlug} currentName={organization.name} />

      <div className="border rounded-lg p-4 space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Workspace URL</span>
          <span className="font-mono">/dashboard/{organization.slug}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Current plan</span>
          <span className="font-medium">{plan.name}</span>
        </div>
      </div>
    </div>
  )
}
