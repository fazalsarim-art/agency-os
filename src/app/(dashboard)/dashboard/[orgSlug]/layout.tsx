import { createClient } from '@/lib/supabase/server'
import { requireOrgMembership } from '@/lib/auth'
import { hasPermission } from '@/lib/permissions'
import { signOut } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'
import { SidebarNav, type NavItem } from '@/components/dashboard/sidebar-nav'

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
  const { user, organization, role } = await requireOrgMembership(orgSlug)

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const base = `/dashboard/${orgSlug}`

  const items: NavItem[] = [
    { href: base, label: 'Overview', exact: true },
    { href: `${base}/clients`, label: 'Clients' },
    { href: `${base}/projects`, label: 'Projects' },
    { href: `${base}/tasks`, label: 'Tasks' },
    { href: `${base}/members`, label: 'Members' },
    ...(hasPermission(role, 'auditLogs:view')
      ? [{ href: `${base}/audit-logs`, label: 'Audit Logs' }]
      : []),
    ...(hasPermission(role, 'billing:manage')
      ? [{ href: `${base}/billing`, label: 'Billing' }]
      : []),
    ...(hasPermission(role, 'organization:manage')
      ? [{ href: `${base}/settings`, label: 'Settings' }]
      : []),
  ]

  return (
    <div className="min-h-screen md:flex">
      <aside className="shrink-0 border-b md:min-h-screen md:w-60 md:border-b-0 md:border-r">
        <div className="px-5 py-4 md:border-b">
          <span className="text-lg font-semibold">AgencyOS</span>
        </div>
        <SidebarNav items={items} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-6 py-3">
          <span className="truncate text-sm font-medium">{organization.name}</span>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {profile?.full_name ?? user.email}
            </span>
            <form action={signOut}>
              <Button variant="outline" size="sm" type="submit">
                Sign out
              </Button>
            </form>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
