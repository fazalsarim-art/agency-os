import { requireOrgMembership } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { hasPermission } from '@/lib/permissions'
import { ClientsSection, type ClientRow } from './clients-section'

const STATUS_FILTERS = ['all', 'active', 'inactive', 'archived'] as const

export default async function ClientsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ status?: string | string[] }>
}) {
  const { orgSlug } = await params
  const sp = await searchParams
  const { organization, role } = await requireOrgMembership(orgSlug)

  const requested = Array.isArray(sp.status) ? sp.status[0] : sp.status
  const activeFilter = (STATUS_FILTERS as readonly string[]).includes(requested ?? '')
    ? (requested as (typeof STATUS_FILTERS)[number])
    : 'all'

  const supabase = await createClient()
  let builder = supabase
    .from('clients')
    .select('id, name, email, company, status')
    .eq('organization_id', organization.id)
    .order('created_at', { ascending: false })

  // Status filter applied server-side, so RLS + org scope always hold.
  if (activeFilter !== 'all') builder = builder.eq('status', activeFilter)

  const { data } = await builder
  const clients: ClientRow[] = (data ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    email: (c.email as string) ?? null,
    company: (c.company as string) ?? null,
    status: c.status as ClientRow['status'],
  }))

  return (
    <ClientsSection
      orgSlug={orgSlug}
      clients={clients}
      activeFilter={activeFilter}
      canCreate={hasPermission(role, 'clients:create')}
      canUpdate={hasPermission(role, 'clients:update')}
      canDelete={hasPermission(role, 'clients:delete')}
    />
  )
}
