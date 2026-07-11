import Link from 'next/link'
import { requireOrgMembership } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getPlan } from '@/lib/plans'
import { hasPermission } from '@/lib/permissions'
import { Button } from '@/components/ui/button'

export default async function OrgHomePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const { organization, role } = await requireOrgMembership(orgSlug)
  const supabase = await createClient()
  const base = `/dashboard/${orgSlug}`

  const countFor = (table: string) =>
    supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organization.id)

  const [clients, activeProjects, openTasks, members, subRes] = await Promise.all([
    countFor('clients'),
    countFor('projects').eq('status', 'active'),
    countFor('tasks').in('status', ['todo', 'in_progress']),
    countFor('organization_members'),
    supabase
      .from('subscriptions')
      .select('plan, status')
      .eq('organization_id', organization.id)
      .maybeSingle(),
  ])

  const sub = subRes.data
  const plan =
    sub && (sub.status === 'active' || sub.status === 'trialing')
      ? getPlan(sub.plan)
      : getPlan('free')

  const cards = [
    { label: 'Clients', value: clients.count ?? 0, href: `${base}/clients` },
    { label: 'Active projects', value: activeProjects.count ?? 0, href: `${base}/projects` },
    { label: 'Open tasks', value: openTasks.count ?? 0, href: `${base}/tasks` },
    { label: 'Members', value: members.count ?? 0, href: `${base}/members` },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="text-muted-foreground text-sm">
          A snapshot of {organization.name}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="border rounded-lg p-4 transition-colors hover:bg-muted/50"
          >
            <p className="text-sm text-muted-foreground">{c.label}</p>
            <p className="mt-1 text-3xl font-bold">{c.value}</p>
          </Link>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-lg border p-4">
        <div>
          <p className="text-sm text-muted-foreground">Current plan</p>
          <p className="text-lg font-semibold">{plan.name}</p>
        </div>
        {hasPermission(role, 'billing:manage') && (
          <Link href={`${base}/billing`}>
            <Button variant="outline" size="sm">
              Manage billing
            </Button>
          </Link>
        )}
      </div>
    </div>
  )
}
