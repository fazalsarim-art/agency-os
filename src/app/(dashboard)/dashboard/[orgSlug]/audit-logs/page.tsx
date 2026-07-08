import { requireOrgMembership } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { hasPermission } from '@/lib/permissions'

type LogRow = {
  id: string
  actor_user_id: string | null
  action: string
  target_type: string | null
  target_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

// Pull a string field out of the (untyped) jsonb metadata, or a dash.
function metaStr(meta: Record<string, unknown> | null, key: string): string {
  const v = meta?.[key]
  return typeof v === 'string' && v.length > 0 ? v : '—'
}

// Turn a log row into a readable activity phrase (the actor's name is prepended
// separately). `nameOf` resolves a user id → display name for member targets.
function describe(log: LogRow, nameOf: (id: string | null) => string): string {
  const m = log.metadata
  switch (log.action) {
    case 'client.created':
      return `created client “${metaStr(m, 'name')}”`
    case 'client.updated':
      return `updated client “${metaStr(m, 'name')}”`
    case 'client.deleted':
      return `deleted client “${metaStr(m, 'name')}”`
    case 'project.created':
      return `created project “${metaStr(m, 'name')}”`
    case 'project.updated':
      return `updated project “${metaStr(m, 'name')}”`
    case 'project.deleted':
      return `deleted project “${metaStr(m, 'name')}”`
    case 'task.created':
      return `created task “${metaStr(m, 'title')}”`
    case 'task.updated':
      return `updated task “${metaStr(m, 'title')}”`
    case 'task.deleted':
      return `deleted task “${metaStr(m, 'title')}”`
    case 'member.role_changed':
      return `changed ${nameOf(log.target_id)}’s role to ${metaStr(m, 'newRole')}`
    case 'member.removed':
      return `removed ${nameOf(log.target_id)} from the organization`
    default:
      return log.action
  }
}

export default async function AuditLogsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const { organization, role } = await requireOrgMembership(orgSlug)

  // Page-level gate. RLS also restricts audit_logs SELECT to owner/admin, so a
  // non-owner/admin would get an empty list anyway — but a clear message beats
  // a silently empty page.
  if (!hasPermission(role, 'auditLogs:view')) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Audit Logs</h1>
        <p className="text-sm text-muted-foreground">
          Only owners and admins can view the audit log.
        </p>
      </div>
    )
  }

  const supabase = await createClient()
  const { data: logData } = await supabase
    .from('audit_logs')
    .select('id, actor_user_id, action, target_type, target_id, metadata, created_at')
    .eq('organization_id', organization.id)
    .order('created_at', { ascending: false })
    .limit(100)

  const logs = (logData ?? []) as LogRow[]

  // Resolve display names for actors and for member targets.
  const userIds = new Set<string>()
  for (const l of logs) {
    if (l.actor_user_id) userIds.add(l.actor_user_id)
    if (l.target_type === 'member' && l.target_id) userIds.add(l.target_id)
  }

  const { data: profileRows } = userIds.size
    ? await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', [...userIds])
    : { data: [] as { id: string; full_name: string | null; email: string | null }[] }

  const nameMap = new Map(
    (profileRows ?? []).map((p) => [p.id, p.full_name ?? p.email ?? 'Unknown'])
  )
  const nameOf = (id: string | null) => (id ? nameMap.get(id) ?? 'a member' : 'a member')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit Logs</h1>
        <p className="text-muted-foreground text-sm">
          A history of important actions in {organization.name}.
        </p>
      </div>

      {logs.length === 0 ? (
        <div className="border border-dashed rounded-lg p-10 text-center">
          <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
        </div>
      ) : (
        <ul className="border rounded-lg divide-y">
          {logs.map((log) => {
            const actor = log.actor_user_id
              ? nameMap.get(log.actor_user_id) ?? 'Someone'
              : 'System'
            const when = new Date(log.created_at).toLocaleString('en-US', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })
            return (
              <li
                key={log.id}
                className="px-4 py-3 flex items-start justify-between gap-4"
              >
                <p className="text-sm">
                  <span className="font-medium">{actor}</span>{' '}
                  {describe(log, nameOf)}
                </p>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {when}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
