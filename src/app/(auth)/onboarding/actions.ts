'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type State = { error: string } | null

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48)
}

async function findUniqueSlug(base: string): Promise<string> {
  const admin = createAdminClient()
  let slug = base
  let i = 2

  while (true) {
    const { data } = await admin
      .from('organizations')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()

    if (!data) return slug
    slug = `${base}-${i}`
    i++
  }
}

export async function createOrganization(
  _prevState: State,
  formData: FormData
): Promise<State> {
  const name = (formData.get('name') as string)?.trim()

  if (!name || name.length < 2) {
    return { error: 'Organization name must be at least 2 characters.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const admin = createAdminClient()
  const baseSlug = generateSlug(name)
  const slug = await findUniqueSlug(baseSlug)

  // Insert org using admin client (bypasses RLS — first-time creation)
  const { data: org, error: orgError } = await admin
    .from('organizations')
    .insert({ name, slug, created_by: user.id })
    .select('id, slug')
    .single()

  if (orgError) return { error: orgError.message }

  // Insert creator as Owner
  const { error: memberError } = await admin
    .from('organization_members')
    .insert({
      organization_id: org.id,
      user_id: user.id,
      role: 'owner',
    })

  if (memberError) return { error: memberError.message }

  redirect(`/dashboard/${org.slug}`)
}
