'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashToken } from '@/lib/invites'
import { createAuditLog } from '@/lib/audit'

// Accepts an invite for the currently logged-in user. Re-validates everything
// on the server (never trusts the page's render). Uses the admin client because
// the invitee is not yet a member and therefore cannot insert their own
// membership row under RLS.
export async function acceptInvite(token: string): Promise<{ error: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=/invite/${token}`)

  const admin = createAdminClient()
  const { data: invite } = await admin
    .from('invites')
    .select('id, organization_id, email, role, status, expires_at, organizations(slug)')
    .eq('token_hash', hashToken(token))
    .maybeSingle()

  if (!invite) return { error: 'This invite link is invalid.' }
  if (invite.status !== 'pending') return { error: 'This invite has already been used.' }
  if (new Date(invite.expires_at) < new Date()) return { error: 'This invite has expired.' }
  if ((user.email ?? '').toLowerCase() !== invite.email.toLowerCase()) {
    return { error: `This invite was sent to ${invite.email}.` }
  }

  // Add the membership. Ignore a unique-violation (already a member) so a
  // double-accept is harmless.
  const { error: memberError } = await admin.from('organization_members').insert({
    organization_id: invite.organization_id,
    user_id: user.id,
    role: invite.role,
  })
  if (memberError && memberError.code !== '23505') {
    return { error: memberError.message }
  }

  await admin
    .from('invites')
    .update({ status: 'accepted', accepted_at: new Date().toISOString() })
    .eq('id', invite.id)

  await createAuditLog({
    orgId: invite.organization_id,
    actorUserId: user.id,
    action: 'invite.accepted',
    targetType: 'invite',
    targetId: invite.id,
    metadata: { email: invite.email, role: invite.role },
  })

  const orgEmbed = invite.organizations as { slug: string } | { slug: string }[] | null
  const slug = Array.isArray(orgEmbed) ? orgEmbed[0]?.slug : orgEmbed?.slug
  redirect(`/dashboard/${slug}`)
}
