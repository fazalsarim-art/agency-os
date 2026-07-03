import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
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
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-lg">AgencyOS</span>
          <span className="text-muted-foreground text-sm">/</span>
          <span className="text-sm font-medium">{orgSlug}</span>
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
      <main className="flex-1 p-6">{children}</main>
    </div>
  )
}
