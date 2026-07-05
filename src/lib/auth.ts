import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import type { Role } from '@/lib/permissions'

// Returns the current user or redirects to /login
export async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return user
}

// Returns the current user or null (no redirect)
export async function getUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export type OrgMembership = {
  user: { id: string; email: string | undefined }
  organization: { id: string; name: string; slug: string }
  role: Role
}

// Guards an organization route: confirms the current user is a MEMBER of the
// org identified by `slug`, and returns the org plus the user's role.
//
// Security note: because the organizations RLS policy only returns rows for
// orgs the user belongs to, a missing membership row means "not a member (or
// no such org)". Either way the user may not see it, so we 404 rather than
// reveal whether the org exists. This is the server-side membership boundary —
// it does not rely on any UI check.
export async function requireOrgMembership(slug: string): Promise<OrgMembership> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await supabase
    .from('organization_members')
    .select('role, organizations!inner(id, name, slug)')
    .eq('organizations.slug', slug)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!data) notFound()

  const organization = data.organizations as unknown as {
    id: string
    name: string
    slug: string
  }

  return {
    user: { id: user.id, email: user.email },
    organization,
    role: data.role as Role,
  }
}
