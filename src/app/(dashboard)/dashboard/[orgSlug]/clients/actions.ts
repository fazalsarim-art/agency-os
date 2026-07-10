'use server'

import { revalidatePath } from 'next/cache'
// Aliased: our own createClient action (below) is the agency-client mutation;
// this is the Supabase server client factory.
import { createClient as createServerClient } from '@/lib/supabase/server'
import { requireOrgMembership } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { createAuditLog } from '@/lib/audit'
import { checkLimit, limitReachedMessage } from '@/lib/limits'

export type ClientFormState = { error: string } | { success: true } | null

const STATUSES = ['active', 'inactive', 'archived'] as const

type Fields = { name: string; email: string; company: string; status: string }

function parseForm(formData: FormData): Fields {
  return {
    name: ((formData.get('name') as string) ?? '').trim(),
    email: ((formData.get('email') as string) ?? '').trim(),
    company: ((formData.get('company') as string) ?? '').trim(),
    status: ((formData.get('status') as string) ?? 'active').trim(),
  }
}

function validate(f: Fields): string | null {
  if (!f.name) return 'Client name is required.'
  if (f.name.length > 120) return 'Client name is too long (max 120 characters).'
  if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) {
    return 'Enter a valid email address.'
  }
  if (!(STATUSES as readonly string[]).includes(f.status)) return 'Invalid status.'
  return null
}

export async function createClient(
  _prev: ClientFormState,
  formData: FormData
): Promise<ClientFormState> {
  const orgSlug = formData.get('orgSlug') as string
  const { user, organization, role } = await requireOrgMembership(orgSlug)
  if (!hasPermission(role, 'clients:create')) {
    return { error: 'You do not have permission to add clients.' }
  }

  const f = parseForm(formData)
  const err = validate(f)
  if (err) return { error: err }

  const supabase = await createServerClient()

  const limit = await checkLimit(supabase, organization.id, 'clients')
  if (!limit.allowed) return { error: limitReachedMessage('clients', limit.plan) }

  const { data: created, error } = await supabase
    .from('clients')
    .insert({
      organization_id: organization.id,
      name: f.name,
      email: f.email || null,
      company: f.company || null,
      status: f.status,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }

  await createAuditLog({
    orgId: organization.id,
    actorUserId: user.id,
    action: 'client.created',
    targetType: 'client',
    targetId: created.id,
    metadata: { name: f.name },
  })

  revalidatePath(`/dashboard/${orgSlug}/clients`)
  return { success: true }
}

export async function updateClient(
  _prev: ClientFormState,
  formData: FormData
): Promise<ClientFormState> {
  const orgSlug = formData.get('orgSlug') as string
  const clientId = formData.get('clientId') as string
  const { user, organization, role } = await requireOrgMembership(orgSlug)
  if (!hasPermission(role, 'clients:update')) {
    return { error: 'You do not have permission to edit clients.' }
  }

  const f = parseForm(formData)
  const err = validate(f)
  if (err) return { error: err }

  const supabase = await createServerClient()
  // organization_id scope is defense-in-depth on top of RLS.
  const { error } = await supabase
    .from('clients')
    .update({
      name: f.name,
      email: f.email || null,
      company: f.company || null,
      status: f.status,
    })
    .eq('id', clientId)
    .eq('organization_id', organization.id)
  if (error) return { error: error.message }

  await createAuditLog({
    orgId: organization.id,
    actorUserId: user.id,
    action: 'client.updated',
    targetType: 'client',
    targetId: clientId,
    metadata: { name: f.name },
  })

  revalidatePath(`/dashboard/${orgSlug}/clients`)
  return { success: true }
}

export async function deleteClient(
  orgSlug: string,
  clientId: string
): Promise<{ error: string } | { success: true }> {
  const { user, organization, role } = await requireOrgMembership(orgSlug)
  if (!hasPermission(role, 'clients:delete')) {
    return { error: 'You do not have permission to delete clients.' }
  }

  const supabase = await createServerClient()
  // Capture the name before deletion so the audit entry stays readable.
  const { data: existing } = await supabase
    .from('clients')
    .select('name')
    .eq('id', clientId)
    .eq('organization_id', organization.id)
    .maybeSingle()

  const { error } = await supabase
    .from('clients')
    .delete()
    .eq('id', clientId)
    .eq('organization_id', organization.id)
  if (error) return { error: error.message }

  await createAuditLog({
    orgId: organization.id,
    actorUserId: user.id,
    action: 'client.deleted',
    targetType: 'client',
    targetId: clientId,
    metadata: { name: existing?.name ?? null },
  })

  revalidatePath(`/dashboard/${orgSlug}/clients`)
  return { success: true }
}
