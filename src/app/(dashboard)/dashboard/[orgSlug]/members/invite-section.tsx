'use client'

import { useState, useTransition } from 'react'
import { ROLE_LABELS, type Role } from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createInvite, revokeInvite } from './actions'

export type InviteRow = {
  id: string
  email: string
  role: string
  expiresAt: string
}

const INVITE_ROLES = ['admin', 'member', 'viewer'] as const

export function InviteSection({
  orgSlug,
  pendingInvites,
}: {
  orgSlug: string
  pendingInvites: InviteRow[]
}) {
  const [error, setError] = useState<string | null>(null)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, start] = useTransition()

  function handleCreate(formData: FormData) {
    setError(null)
    setInviteLink(null)
    setCopied(false)
    const email = (formData.get('email') as string) ?? ''
    const role = (formData.get('role') as string) ?? 'member'
    start(async () => {
      const res = await createInvite(orgSlug, email, role)
      if ('error' in res) {
        setError(res.error)
        return
      }
      setInviteLink(`${window.location.origin}/invite/${res.token}`)
    })
  }

  function handleRevoke(id: string) {
    setError(null)
    start(async () => {
      const res = await revokeInvite(orgSlug, id)
      if ('error' in res) setError(res.error)
    })
  }

  async function copyLink() {
    if (!inviteLink) return
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked — the user can still select the text manually.
    }
  }

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div>
        <h2 className="font-medium">Invite a member</h2>
        <p className="text-sm text-muted-foreground">
          Send someone an invite link to join with a specific role.
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
          {error}
        </p>
      )}

      <form
        action={handleCreate}
        className="flex flex-col sm:flex-row gap-3 sm:items-end"
      >
        <div className="space-y-2 flex-1">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            name="email"
            type="email"
            placeholder="teammate@example.com"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="invite-role">Role</Label>
          <select
            id="invite-role"
            name="role"
            defaultValue="member"
            className="w-full sm:w-40 border rounded-md px-3 py-2 bg-background text-sm"
          >
            {INVITE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r as Role]}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Working…' : 'Create invite'}
        </Button>
      </form>

      {inviteLink && (
        <div className="space-y-2 rounded-md bg-muted/50 p-3">
          <p className="text-sm font-medium">
            Invite link — copy it now, it won’t be shown again:
          </p>
          <div className="flex gap-2">
            <Input
              readOnly
              value={inviteLink}
              onFocus={(e) => e.currentTarget.select()}
              className="font-mono text-xs"
            />
            <Button type="button" variant="outline" onClick={copyLink}>
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
        </div>
      )}

      {pendingInvites.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Pending invites</p>
          <div className="border rounded-md divide-y">
            {pendingInvites.map((inv) => (
              <div
                key={inv.id}
                className="px-3 py-2 flex items-center justify-between gap-4 text-sm"
              >
                <div>
                  <span className="font-medium">{inv.email}</span>{' '}
                  <span className="text-muted-foreground">
                    · {ROLE_LABELS[inv.role as Role] ?? inv.role} · expires{' '}
                    {inv.expiresAt}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => handleRevoke(inv.id)}
                >
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
