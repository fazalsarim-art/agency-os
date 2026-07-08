import { requireOrgMembership } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { hasPermission } from '@/lib/permissions'
import {
  TasksSection,
  type TaskRow,
  type ProjectOption,
  type MemberOption,
} from './tasks-section'

const STATUS_FILTERS = ['all', 'todo', 'in_progress', 'done'] as const

export default async function TasksPage({
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
    .from('tasks')
    .select('id, title, description, status, due_date, project_id, assigned_to, projects(name)')
    .eq('organization_id', organization.id)
    .order('created_at', { ascending: false })
  if (activeFilter !== 'all') builder = builder.eq('status', activeFilter)
  const { data: taskData } = await builder

  // Org members (for the assignee dropdown AND to resolve assignee names).
  const { data: memberRows } = await supabase
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', organization.id)
  const memberIds = (memberRows ?? []).map((m) => m.user_id as string)

  const { data: profileRows } = memberIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', memberIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null }[] }
  const nameOf = (id: string | null) => {
    if (!id) return null
    const p = (profileRows ?? []).find((r) => r.id === id)
    return p?.full_name ?? p?.email ?? null
  }

  const tasks: TaskRow[] = (taskData ?? []).map((t) => {
    const embed = t.projects as { name: string } | { name: string }[] | null
    const projectName = Array.isArray(embed) ? embed[0]?.name ?? null : embed?.name ?? null
    return {
      id: t.id as string,
      title: t.title as string,
      description: (t.description as string) ?? null,
      status: t.status as TaskRow['status'],
      dueDate: (t.due_date as string) ?? null,
      projectId: (t.project_id as string) ?? null,
      projectName,
      assignedTo: (t.assigned_to as string) ?? null,
      assigneeName: nameOf((t.assigned_to as string) ?? null),
    }
  })

  const memberOptions: MemberOption[] = (profileRows ?? []).map((p) => ({
    userId: p.id,
    name: p.full_name ?? p.email ?? 'Unknown',
  }))

  const { data: projectData } = await supabase
    .from('projects')
    .select('id, name')
    .eq('organization_id', organization.id)
    .order('name', { ascending: true })
  const projectOptions: ProjectOption[] = (projectData ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
  }))

  return (
    <TasksSection
      orgSlug={orgSlug}
      tasks={tasks}
      projectOptions={projectOptions}
      memberOptions={memberOptions}
      activeFilter={activeFilter}
      canCreate={hasPermission(role, 'tasks:create')}
      canUpdate={hasPermission(role, 'tasks:update')}
      canDelete={hasPermission(role, 'tasks:delete')}
    />
  )
}
