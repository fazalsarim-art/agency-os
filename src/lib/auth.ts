import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

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
