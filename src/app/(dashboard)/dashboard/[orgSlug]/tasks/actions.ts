'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireOrgMembership } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { createAuditLog } from '@/lib/audit'

export type TaskFormState = { error: string } | { success: true } | null

const STATUSES = ['todo', 'in_progress', 'done'] as const

type Fields = {
  title: string
  projectId: string | null
  assignedTo: string | null
  description: string
  status: string
  dueDate: string | null
}

function parseForm(formData: FormData): Fields {
  const projectId = ((formData.get('projectId') as string) ?? '').trim()
  const assignedTo = ((formData.get('assignedTo') as string) ?? '').trim()
  const dueDate = ((formData.get('dueDate') as string) ?? '').trim()
  return {
    title: ((formData.get('title') as string) ?? '').trim(),
    projectId: projectId || null,
    assignedTo: assignedTo || null,
    description: ((formData.get('description') as string) ?? '').trim(),
    status: ((formData.get('status') as string) ?? 'todo').trim(),
    dueDate: dueDate || null,
  }
}

function validate(f: Fields): string | null {
  if (!f.title) return 'Task title is required.'
  if (f.title.length > 160) return 'Task title is too long (max 160 characters).'
  if (!(STATUSES as readonly string[]).includes(f.status)) return 'Invalid status.'
  if (f.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(f.dueDate)) return 'Invalid due date.'
  return null
}

// A chosen project must belong to THIS org (blocks linking another org's project).
async function resolveProjectId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  projectId: string | null
): Promise<{ ok: true; value: string | null } | { ok: false }> {
  if (!projectId) return { ok: true, value: null }
  const { data } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('organization_id', orgId)
    .maybeSingle()
  return data ? { ok: true, value: projectId } : { ok: false }
}

// An assignee must be a MEMBER of this org (blocks assigning to outsiders).
async function resolveAssignee(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  userId: string | null
): Promise<{ ok: true; value: string | null } | { ok: false }> {
  if (!userId) return { ok: true, value: null }
  const { data } = await supabase
    .from('organization_members')
    .select('user_id')
    .eq('user_id', userId)
    .eq('organization_id', orgId)
    .maybeSingle()
  return data ? { ok: true, value: userId } : { ok: false }
}

export async function createTask(
  _prev: TaskFormState,
  formData: FormData
): Promise<TaskFormState> {
  const orgSlug = formData.get('orgSlug') as string
  const { user, organization, role } = await requireOrgMembership(orgSlug)
  if (!hasPermission(role, 'tasks:create')) {
    return { error: 'You do not have permission to add tasks.' }
  }

  const f = parseForm(formData)
  const err = validate(f)
  if (err) return { error: err }

  const supabase = await createClient()
  const project = await resolveProjectId(supabase, organization.id, f.projectId)
  if (!project.ok) return { error: 'Selected project was not found.' }
  const assignee = await resolveAssignee(supabase, organization.id, f.assignedTo)
  if (!assignee.ok) return { error: 'Assignee must be a member of this organization.' }

  const { data: created, error } = await supabase
    .from('tasks')
    .insert({
      organization_id: organization.id,
      project_id: project.value,
      assigned_to: assignee.value,
      title: f.title,
      description: f.description || null,
      status: f.status,
      due_date: f.dueDate,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }

  await createAuditLog({
    orgId: organization.id,
    actorUserId: user.id,
    action: 'task.created',
    targetType: 'task',
    targetId: created.id,
    metadata: { title: f.title },
  })

  revalidatePath(`/dashboard/${orgSlug}/tasks`)
  return { success: true }
}

export async function updateTask(
  _prev: TaskFormState,
  formData: FormData
): Promise<TaskFormState> {
  const orgSlug = formData.get('orgSlug') as string
  const taskId = formData.get('taskId') as string
  const { user, organization, role } = await requireOrgMembership(orgSlug)
  if (!hasPermission(role, 'tasks:update')) {
    return { error: 'You do not have permission to edit tasks.' }
  }

  const f = parseForm(formData)
  const err = validate(f)
  if (err) return { error: err }

  const supabase = await createClient()
  const project = await resolveProjectId(supabase, organization.id, f.projectId)
  if (!project.ok) return { error: 'Selected project was not found.' }
  const assignee = await resolveAssignee(supabase, organization.id, f.assignedTo)
  if (!assignee.ok) return { error: 'Assignee must be a member of this organization.' }

  const { error } = await supabase
    .from('tasks')
    .update({
      project_id: project.value,
      assigned_to: assignee.value,
      title: f.title,
      description: f.description || null,
      status: f.status,
      due_date: f.dueDate,
    })
    .eq('id', taskId)
    .eq('organization_id', organization.id)
  if (error) return { error: error.message }

  await createAuditLog({
    orgId: organization.id,
    actorUserId: user.id,
    action: 'task.updated',
    targetType: 'task',
    targetId: taskId,
    metadata: { title: f.title },
  })

  revalidatePath(`/dashboard/${orgSlug}/tasks`)
  return { success: true }
}

export async function deleteTask(
  orgSlug: string,
  taskId: string
): Promise<{ error: string } | { success: true }> {
  const { user, organization, role } = await requireOrgMembership(orgSlug)
  if (!hasPermission(role, 'tasks:delete')) {
    return { error: 'You do not have permission to delete tasks.' }
  }

  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('tasks')
    .select('title')
    .eq('id', taskId)
    .eq('organization_id', organization.id)
    .maybeSingle()

  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId)
    .eq('organization_id', organization.id)
  if (error) return { error: error.message }

  await createAuditLog({
    orgId: organization.id,
    actorUserId: user.id,
    action: 'task.deleted',
    targetType: 'task',
    targetId: taskId,
    metadata: { title: existing?.title ?? null },
  })

  revalidatePath(`/dashboard/${orgSlug}/tasks`)
  return { success: true }
}
