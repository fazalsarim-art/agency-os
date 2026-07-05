import { requireOrgMembership } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { hasPermission, type Role } from '@/lib/permissions'
import { MembersTable, type MemberRow } from './members-table'

export default async function MembersPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const { user, organization, role } = await requireOrgMembership(orgSlug)

  const supabase = await createClient()

  // Members of this org (RLS lets us read these because we're a member).
  const { data: memberRows } = await supabase
    .from('organization_members')
    .select('id, role, created_at, user_id')
    .eq('organization_id', organization.id)
    .order('created_at', { ascending: true })

  const members = memberRows ?? []
  const userIds = members.map((m) => m.user_id)

  // Names + emails for those members (RLS: only same-org profiles are visible).
  const { data: profileRows } = userIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', userIds)
    : { data: [] }

  const profileMap = new Map((profileRows ?? []).map((p) => [p.id, p]))

  // Format the joined date on the server (deterministic — avoids hydration drift).
  const rows: MemberRow[] = members.map((m) => ({
    id: m.id,
    userId: m.user_id,
    role: m.role as Role,
    joinedAt: new Date(m.created_at).toISOString().slice(0, 10),
    fullName: profileMap.get(m.user_id)?.full_name ?? null,
    email: profileMap.get(m.user_id)?.email ?? null,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Members</h1>
        <p className="text-muted-foreground text-sm">
          People with access to {organization.name}.
        </p>
      </div>
      <MembersTable
        orgSlug={orgSlug}
        rows={rows}
        currentUserId={user.id}
        canManage={hasPermission(role, 'members:manage')}
      />
    </div>
  )
}
