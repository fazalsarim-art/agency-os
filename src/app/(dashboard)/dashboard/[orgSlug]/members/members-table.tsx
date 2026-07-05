'use client'

import { useState, useTransition } from 'react'
import { ROLES, ROLE_LABELS, type Role } from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { updateMemberRole, removeMember } from './actions'

export type MemberRow = {
  id: string
  userId: string
  role: Role
  joinedAt: string
  fullName: string | null
  email: string | null
}

export function MembersTable({
  orgSlug,
  rows,
  currentUserId,
  canManage,
}: {
  orgSlug: string
  rows: MemberRow[]
  currentUserId: string
  canManage: boolean
}) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function changeRole(memberId: string, newRole: string) {
    setError(null)
    startTransition(async () => {
      const res = await updateMemberRole(orgSlug, memberId, newRole)
      if ('error' in res) setError(res.error)
    })
  }

  function remove(memberId: string) {
    setError(null)
    startTransition(async () => {
      const res = await removeMember(orgSlug, memberId)
      if ('error' in res) setError(res.error)
    })
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
          {error}
        </p>
      )}

      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 font-medium">Joined</th>
              {canManage && (
                <th className="px-4 py-2 font-medium text-right">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const isSelf = m.userId === currentUserId
              return (
                <tr key={m.id} className="border-t">
                  <td className="px-4 py-2">
                    {m.fullName ?? '—'}
                    {isSelf && (
                      <span className="text-muted-foreground"> (you)</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {m.email ?? '—'}
                  </td>
                  <td className="px-4 py-2">
                    {canManage ? (
                      <select
                        className="border rounded-md px-2 py-1 bg-background disabled:opacity-50"
                        defaultValue={m.role}
                        disabled={isPending}
                        onChange={(e) => changeRole(m.id, e.target.value)}
                        aria-label={`Role for ${m.fullName ?? m.email ?? 'member'}`}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      ROLE_LABELS[m.role]
                    )}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{m.joinedAt}</td>
                  {canManage && (
                    <td className="px-4 py-2 text-right">
                      {!isSelf && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isPending}
                          onClick={() => remove(m.id)}
                        >
                          Remove
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {canManage && (
        <p className="text-xs text-muted-foreground">
          Role changes apply immediately. The last owner can&apos;t be demoted or
          removed.
        </p>
      )}
    </div>
  )
}
