import { createAdminClient } from '@/lib/supabase/admin'

// One audit entry. `metadata` holds small, non-sensitive extras used to render
// a readable activity line (e.g. { name } or { title }). NEVER put secrets,
// tokens, or payment details here.
type AuditParams = {
  orgId: string
  actorUserId: string | null
  action: string
  targetType?: string | null
  targetId?: string | null
  metadata?: Record<string, unknown> | null
}

// Writes an audit log entry using the service-role client, because audit_logs
// has NO authenticated INSERT policy — only the backend may write logs, so a
// user can never forge or tamper with the history.
//
// Call this AFTER the main mutation succeeds. It deliberately never throws: a
// failure to record the log should not break the user's action, so errors are
// swallowed (and logged to the server console) instead.
export async function createAuditLog(params: AuditParams): Promise<void> {
  try {
    const admin = createAdminClient()
    const { error } = await admin.from('audit_logs').insert({
      organization_id: params.orgId,
      actor_user_id: params.actorUserId,
      action: params.action,
      target_type: params.targetType ?? null,
      target_id: params.targetId ?? null,
      metadata: params.metadata ?? null,
    })
    if (error) console.error('[audit] failed to write log:', error.message)
  } catch (e) {
    console.error('[audit] unexpected error:', e)
  }
}
