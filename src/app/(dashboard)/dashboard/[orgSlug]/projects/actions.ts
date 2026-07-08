'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireOrgMembership } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { createAuditLog } from '@/lib/audit'

export type ProjectFormState = { error: string } | { success: true } | null

const STATUSES = ['active', 'completed', 'archived'] as const

type Fields = {
  name: string
  clientId: string | null
  description: string
  status: string
  dueDate: string | null
}

function parseForm(formData: FormData): Fields {
  const clientId = ((formData.get('clientId') as string) ?? '').trim()
  const dueDate = ((formData.get('dueDate') as string) ?? '').trim()
  return {
    name: ((formData.get('name') as string) ?? '').trim(),
    clientId: clientId || null,
    description: ((formData.get('description') as string) ?? '').trim(),
    status: ((formData.get('status') as string) ?? 'active').trim(),
    dueDate: dueDate || null,
  }
}

function validate(f: Fields): string | null {
  if (!f.name) return 'Project name is required.'
  if (f.name.length > 120) return 'Project name is too long (max 120 characters).'
  if (!(STATUSES as readonly string[]).includes(f.status)) return 'Invalid status.'
  if (f.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(f.dueDate)) return 'Invalid due date.'
  return null
}

// Ensure a chosen client belongs to THIS org — prevents linking a project to
// another organization's client via a crafted request.
async function resolveClientId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  clientId: string | null
): Promise<{ ok: true; value: string | null } | { ok: false }> {
  if (!clientId) return { ok: true, value: null }
  const { data } = await supabase
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .eq('organization_id', orgId)
    .maybeSingle()
  return data ? { ok: true, value: clientId } : { ok: false }
}

export async function createProject(
  _prev: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  const orgSlug = formData.get('orgSlug') as string
  const { user, organization, role } = await requireOrgMembership(orgSlug)
  if (!hasPermission(role, 'projects:create')) {
    return { error: 'You do not have permission to add projects.' }
  }

  const f = parseForm(formData)
  const err = validate(f)
  if (err) return { error: err }

  const supabase = await createClient()
  const client = await resolveClientId(supabase, organization.id, f.clientId)
  if (!client.ok) return { error: 'Selected client was not found.' }

  const { data: created, error } = await supabase
    .from('projects')
    .insert({
      organization_id: organization.id,
      client_id: client.value,
      name: f.name,
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
    action: 'project.created',
    targetType: 'project',
    targetId: created.id,
    metadata: { name: f.name },
  })

  revalidatePath(`/dashboard/${orgSlug}/projects`)
  return { success: true }
}

export async function updateProject(
  _prev: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  const orgSlug = formData.get('orgSlug') as string
  const projectId = formData.get('projectId') as string
  const { user, organization, role } = await requireOrgMembership(orgSlug)
  if (!hasPermission(role, 'projects:update')) {
    return { error: 'You do not have permission to edit projects.' }
  }

  const f = parseForm(formData)
  const err = validate(f)
  if (err) return { error: err }

  const supabase = await createClient()
  const client = await resolveClientId(supabase, organization.id, f.clientId)
  if (!client.ok) return { error: 'Selected client was not found.' }

  const { error } = await supabase
    .from('projects')
    .update({
      client_id: client.value,
      name: f.name,
      description: f.description || null,
      status: f.status,
      due_date: f.dueDate,
    })
    .eq('id', projectId)
    .eq('organization_id', organization.id)
  if (error) return { error: error.message }

  await createAuditLog({
    orgId: organization.id,
    actorUserId: user.id,
    action: 'project.updated',
    targetType: 'project',
    targetId: projectId,
    metadata: { name: f.name },
  })

  revalidatePath(`/dashboard/${orgSlug}/projects`)
  return { success: true }
}

export async function deleteProject(
  orgSlug: string,
  projectId: string
): Promise<{ error: string } | { success: true }> {
  const { user, organization, role } = await requireOrgMembership(orgSlug)
  if (!hasPermission(role, 'projects:delete')) {
    return { error: 'You do not have permission to delete projects.' }
  }

  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('projects')
    .select('name')
    .eq('id', projectId)
    .eq('organization_id', organization.id)
    .maybeSingle()

  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId)
    .eq('organization_id', organization.id)
  if (error) return { error: error.message }

  await createAuditLog({
    orgId: organization.id,
    actorUserId: user.id,
    action: 'project.deleted',
    targetType: 'project',
    targetId: projectId,
    metadata: { name: existing?.name ?? null },
  })

  revalidatePath(`/dashboard/${orgSlug}/projects`)
  return { success: true }
}
