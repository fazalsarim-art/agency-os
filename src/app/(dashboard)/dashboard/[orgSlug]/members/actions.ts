'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOrgMembership } from '@/lib/auth'
import { hasPermission, isRole } from '@/lib/permissions'
import { createAuditLog } from '@/lib/audit'
import { generateInviteToken, hashToken, inviteExpiryDate } from '@/lib/invites'

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

export type InviteResult = { error: string } | { token: string }

const INVITABLE_ROLES = ['admin', 'member', 'viewer']

// Creates a pending invite and returns the RAW token (shown once, so the
// inviter can copy the link). Only the token hash is stored.
export async function createInvite(
  orgSlug: string,
  email: string,
  roleToAssign: string
): Promise<InviteResult> {
  const { user, organization, role } = await requireOrgMembership(orgSlug)
  if (!hasPermission(role, 'members:invite')) {
    return { error: 'Only owners and admins can invite members.' }
  }

  const cleanEmail = email.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
    return { error: 'Enter a valid email address.' }
  }
  if (!INVITABLE_ROLES.includes(roleToAssign)) {
    return { error: 'Invalid role.' }
  }

  // Is this email already a member? Use the admin client, because the email may
  // belong to someone whose profile the inviter can't otherwise read.
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('email', cleanEmail)
    .maybeSingle()
  if (profile) {
    const { data: member } = await admin
      .from('organization_members')
      .select('id')
      .eq('organization_id', organization.id)
      .eq('user_id', profile.id)
      .maybeSingle()
    if (member) {
      return { error: 'That person is already a member of this organization.' }
    }
  }

  const supabase = await createClient()

  // Avoid duplicate pending invites for the same email.
  const { data: pending } = await supabase
    .from('invites')
    .select('id')
    .eq('organization_id', organization.id)
    .eq('email', cleanEmail)
    .eq('status', 'pending')
    .limit(1)
  if (pending && pending.length > 0) {
    return { error: 'An invite is already pending for this email.' }
  }

  const token = generateInviteToken()
  const { error } = await supabase.from('invites').insert({
    organization_id: organization.id,
    email: cleanEmail,
    role: roleToAssign,
    token_hash: hashToken(token),
    status: 'pending',
    expires_at: inviteExpiryDate(),
    created_by: user.id,
  })
  if (error) return { error: error.message }

  await createAuditLog({
    orgId: organization.id,
    actorUserId: user.id,
    action: 'invite.created',
    targetType: 'invite',
    metadata: { email: cleanEmail, role: roleToAssign },
  })

  revalidatePath(`/dashboard/${orgSlug}/members`)
  return { token }
}

// Cancels a pending invite.
export async function revokeInvite(
  orgSlug: string,
  inviteId: string
): Promise<MemberActionResult> {
  const { organization, role } = await requireOrgMembership(orgSlug)
  if (!hasPermission(role, 'members:invite')) {
    return { error: 'Only owners and admins can manage invites.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('invites')
    .delete()
    .eq('id', inviteId)
    .eq('organization_id', organization.id)
  if (error) return { error: error.message }

  revalidatePath(`/dashboard/${orgSlug}/members`)
  return { success: true }
}
