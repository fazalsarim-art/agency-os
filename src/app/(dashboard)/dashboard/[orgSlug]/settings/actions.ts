'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireOrgMembership } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { createAuditLog } from '@/lib/audit'

export type SettingsState = { error: string } | { success: true } | null

export async function renameOrganization(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const orgSlug = formData.get('orgSlug') as string
  const name = ((formData.get('name') as string) ?? '').trim()

  const { user, organization, role } = await requireOrgMembership(orgSlug)
  if (!hasPermission(role, 'organization:manage')) {
    return { error: 'Only owners can change organization settings.' }
  }
  if (name.length < 2) {
    return { error: 'Organization name must be at least 2 characters.' }
  }
  if (name.length > 120) {
    return { error: 'Organization name is too long (max 120 characters).' }
  }

  const supabase = await createClient()
  // RLS also enforces owner-only updates as a backstop.
  const { error } = await supabase
    .from('organizations')
    .update({ name })
    .eq('id', organization.id)
  if (error) return { error: error.message }

  await createAuditLog({
    orgId: organization.id,
    actorUserId: user.id,
    action: 'organization.renamed',
    targetType: 'organization',
    targetId: organization.id,
    metadata: { name },
  })

  // Refresh the whole org subtree so the header/nav reflect the new name.
  revalidatePath(`/dashboard/${orgSlug}`, 'layout')
  return { success: true }
}
