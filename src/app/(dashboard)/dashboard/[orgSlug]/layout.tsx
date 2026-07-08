import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { requireOrgMembership } from '@/lib/auth'
import { signOut } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params

  // Membership guard: 404s anyone who isn't a member of this org. Also gives us
  // the org record and the user's role for the whole subtree.
  const { user, organization } = await requireOrgMembership(orgSlug)

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const base = `/dashboard/${orgSlug}`

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-lg">AgencyOS</span>
          <span className="text-muted-foreground text-sm">/</span>
          <span className="text-sm font-medium">{organization.name}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            {profile?.full_name ?? user.email}
          </span>
          <form action={signOut}>
            <Button variant="outline" size="sm" type="submit">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <nav className="border-b px-6 py-2 flex items-center gap-4 text-sm">
        <Link href={base} className="text-muted-foreground hover:text-foreground">
          Overview
        </Link>
        <Link
          href={`${base}/clients`}
          className="text-muted-foreground hover:text-foreground"
        >
          Clients
        </Link>
        <Link
          href={`${base}/members`}
          className="text-muted-foreground hover:text-foreground"
        >
          Members
        </Link>
      </nav>
      <main className="flex-1 p-6">{children}</main>
    </div>
  )
}
