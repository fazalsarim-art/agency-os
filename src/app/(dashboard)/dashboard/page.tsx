import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

// Hub page: routes the user to their org dashboard or onboarding
export default async function DashboardHubPage() {
  const user = await requireUser()
  const supabase = await createClient()

  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organizations(slug)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)

  const org = memberships?.[0]?.organizations as { slug: string } | null | undefined
  const firstSlug = org?.slug ?? null

  if (firstSlug) {
    redirect(`/dashboard/${firstSlug}`)
  }

  redirect('/onboarding')
}
