import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashToken } from '@/lib/invites'
import { ROLE_LABELS, type Role } from '@/lib/permissions'
import { signOut } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { AcceptButton } from './accept-button'

function Card({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md border rounded-lg p-6 space-y-4 text-center">
        <h1 className="text-xl font-bold">{title}</h1>
        {children}
      </div>
    </div>
  )
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  // Look up the invite by token hash via the admin client — the invitee is not
  // a member yet, so they can't read the invites table under RLS.
  const admin = createAdminClient()
  const { data: invite } = await admin
    .from('invites')
    .select('email, role, status, expires_at, organizations(name)')
    .eq('token_hash', hashToken(token))
    .maybeSingle()

  if (!invite) {
    return (
      <Card title="Invalid invite">
        <p className="text-sm text-muted-foreground">
          This invite link is invalid or has been revoked.
        </p>
      </Card>
    )
  }

  if (invite.status !== 'pending') {
    return (
      <Card title="Invite already used">
        <p className="text-sm text-muted-foreground">
          This invitation has already been accepted.
        </p>
        <Link href="/dashboard" className="text-sm underline">
          Go to your dashboard
        </Link>
      </Card>
    )
  }

  if (new Date(invite.expires_at) < new Date()) {
    return (
      <Card title="Invite expired">
        <p className="text-sm text-muted-foreground">
          This invitation has expired. Ask an admin to send a new one.
        </p>
      </Card>
    )
  }

  const orgEmbed = invite.organizations as { name: string } | { name: string }[] | null
  const orgName = Array.isArray(orgEmbed) ? orgEmbed[0]?.name : orgEmbed?.name
  const roleLabel = ROLE_LABELS[invite.role as Role] ?? invite.role

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Logged out — send them to log in or sign up, then back here.
  if (!user) {
    const next = `/invite/${token}`
    return (
      <Card title="You’re invited">
        <p className="text-sm text-muted-foreground">
          You’ve been invited to join <strong>{orgName}</strong> as{' '}
          <strong>{roleLabel}</strong>. Sign in or create an account with{' '}
          <strong>{invite.email}</strong> to accept.
        </p>
        <div className="flex gap-2 justify-center">
          <Link href={`/login?next=${encodeURIComponent(next)}`}>
            <Button>Log in</Button>
          </Link>
          <Link href={`/signup?next=${encodeURIComponent(next)}`}>
            <Button variant="outline">Sign up</Button>
          </Link>
        </div>
      </Card>
    )
  }

  // Logged in as the wrong account — require an email match.
  if ((user.email ?? '').toLowerCase() !== invite.email.toLowerCase()) {
    return (
      <Card title="Wrong account">
        <p className="text-sm text-muted-foreground">
          This invite was sent to <strong>{invite.email}</strong>, but you’re
          signed in as <strong>{user.email}</strong>. Sign out and use the
          invited email to accept.
        </p>
        <form action={signOut}>
          <Button variant="outline" type="submit">
            Sign out
          </Button>
        </form>
      </Card>
    )
  }

  // Ready to accept.
  return (
    <Card title={`Join ${orgName}`}>
      <p className="text-sm text-muted-foreground">
        You’ve been invited to join <strong>{orgName}</strong> as{' '}
        <strong>{roleLabel}</strong>.
      </p>
      <AcceptButton token={token} />
    </Card>
  )
}
