import { requireOrgMembership } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { hasPermission } from '@/lib/permissions'
import {
  ProjectsSection,
  type ProjectRow,
  type ClientOption,
} from './projects-section'

const STATUS_FILTERS = ['all', 'active', 'completed', 'archived'] as const

export default async function ProjectsPage({
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
    .from('projects')
    .select('id, name, description, status, due_date, client_id, clients(name)')
    .eq('organization_id', organization.id)
    .order('created_at', { ascending: false })
  if (activeFilter !== 'all') builder = builder.eq('status', activeFilter)

  const { data } = await builder

  const projects: ProjectRow[] = (data ?? []).map((p) => {
    const embed = p.clients as { name: string } | { name: string }[] | null
    const clientName = Array.isArray(embed) ? embed[0]?.name ?? null : embed?.name ?? null
    return {
      id: p.id as string,
      name: p.name as string,
      description: (p.description as string) ?? null,
      status: p.status as ProjectRow['status'],
      dueDate: (p.due_date as string) ?? null,
      clientId: (p.client_id as string) ?? null,
      clientName,
    }
  })

  // Clients in this org, for the project form's client dropdown.
  const { data: clientData } = await supabase
    .from('clients')
    .select('id, name')
    .eq('organization_id', organization.id)
    .order('name', { ascending: true })

  const clientOptions: ClientOption[] = (clientData ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
  }))

  return (
    <ProjectsSection
      orgSlug={orgSlug}
      projects={projects}
      clientOptions={clientOptions}
      activeFilter={activeFilter}
      canCreate={hasPermission(role, 'projects:create')}
      canUpdate={hasPermission(role, 'projects:update')}
      canDelete={hasPermission(role, 'projects:delete')}
    />
  )
}
