'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

type State = { error: string } | null

// Turn a display name into a URL-safe base slug.
// Falls back to 'workspace' when the name has no slug-able characters (e.g. "!!"),
// so we never build a broken /dashboard/ URL. The DB function guarantees final
// uniqueness (appending -2, -3, … on collision).
function generateSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '')
  return slug || 'workspace'
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

  // Create the organization and the creator's owner membership atomically.
  // create_organization() is a SECURITY DEFINER function (see
  // db/migrations/003_create_organization_fn.sql) that runs both inserts in a
  // single transaction using auth.uid(), returning the final unique slug. This
  // means a failure can never leave an orphaned org, and no service-role key is
  // needed on this user-facing path.
  const { data: slug, error } = await supabase.rpc('create_organization', {
    org_name: name,
    base_slug: generateSlug(name),
  })

  if (error) return { error: error.message }

  redirect(`/dashboard/${slug}`)
}
