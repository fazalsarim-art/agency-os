'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireOrgMembership } from '@/lib/auth'
import { hasPermission, isRole } from '@/lib/permissions'
import { createAuditLog } from '@/lib/audit'

export type MemberActionResult = { error: string } | { success: true }

// Counts how many owners an org currently has (used for last-owner protection).
async function countOwners(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string
): Promise<number> {
  const { count } = await supabase
    .from('organization_members')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('role', 'owner')
  return count ?? 0
}

export async function updateMemberRole(
  orgSlug: string,
  memberId: string,
  newRole: string
): Promise<MemberActionResult> {
  // Authenticate + authorize on the server. Never trust the client: the UI
  // only hides controls; this is the real boundary.
  const { user, organization, role } = await requireOrgMembership(orgSlug)
  if (!hasPermission(role, 'members:manage')) {
    return { error: 'Only owners can change member roles.' }
  }
  if (!isRole(newRole)) {
    return { error: 'Invalid role.' }
  }

  const supabase = await createClient()

  const { data: target } = await supabase
    .from('organization_members')
    .select('id, role, user_id')
    .eq('id', memberId)
    .eq('organization_id', organization.id)
    .maybeSingle()

  if (!target) return { error: 'Member not found.' }
  if (target.role === newRole) return { success: true }

  // Last-owner protection: don't let the final owner be demoted (would lock the org).
  if (target.role === 'owner' && newRole !== 'owner') {
    if ((await countOwners(supabase, organization.id)) <= 1) {
      return { error: 'You cannot demote the last owner. Assign another owner first.' }
    }
  }

  const { error } = await supabase
    .from('organization_members')
    .update({ role: newRole })
    .eq('id', memberId)
    .eq('organization_id', organization.id)

  if (error) return { error: error.message }

  await createAuditLog({
    orgId: organization.id,
    actorUserId: user.id,
    action: 'member.role_changed',
    targetType: 'member',
    targetId: target.user_id,
    metadata: { newRole, previousRole: target.role },
  })

  revalidatePath(`/dashboard/${orgSlug}/members`)
  return { success: true }
}

export async function removeMember(
  orgSlug: string,
  memberId: string
): Promise<MemberActionResult> {
  const { user, organization, role } = await requireOrgMembership(orgSlug)
  if (!hasPermission(role, 'members:manage')) {
    return { error: 'Only owners can remove members.' }
  }

  const supabase = await createClient()

  const { data: target } = await supabase
    .from('organization_members')
    .select('id, role, user_id')
    .eq('id', memberId)
    .eq('organization_id', organization.id)
    .maybeSingle()

  if (!target) return { error: 'Member not found.' }
  if (target.user_id === user.id) {
    return { error: 'You cannot remove yourself.' }
  }
  if (target.role === 'owner' && (await countOwners(supabase, organization.id)) <= 1) {
    return { error: 'You cannot remove the last owner.' }
  }

  const { error } = await supabase
    .from('organization_members')
    .delete()
    .eq('id', memberId)
    .eq('organization_id', organization.id)

  if (error) return { error: error.message }

  await createAuditLog({
    orgId: organization.id,
    actorUserId: user.id,
    action: 'member.removed',
    targetType: 'member',
    targetId: target.user_id,
    metadata: { role: target.role },
  })

  revalidatePath(`/dashboard/${orgSlug}/members`)
  return { success: true }
}
