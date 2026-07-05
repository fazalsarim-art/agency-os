-- ================================================================
-- AgencyOS — 004_profiles_email_and_privacy.sql
-- Members page support + a cross-tenant privacy fix.
-- Run in: Supabase Dashboard > SQL Editor (AFTER 003_create_organization_fn.sql)
-- ================================================================
--
-- WHAT THIS DOES
-- --------------
-- 1. Adds `email` to profiles so the Members page can show it.
-- 2. Populates email on signup (trigger) and backfills existing rows.
-- 3. Tightens the profiles read policy. Previously ANY authenticated user could
--    read EVERY profile row ("USING (true)"), which would leak names/emails
--    across organizations. Now a user can read only their own profile and the
--    profiles of people they share an organization with.
-- ================================================================


-- --- 1. Add email column -------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;


-- --- 2. Populate email on signup + backfill ------------------------
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, email)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Backfill email for profiles created before this migration
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id
  AND p.email IS NULL;


-- --- 3. Org-scoped profile visibility ------------------------------
-- Helper: does the current user share ANY organization with `other`?
-- SECURITY DEFINER so it bypasses RLS on organization_members (no recursion).
CREATE OR REPLACE FUNCTION shares_org(other uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.organization_members me
    JOIN public.organization_members them
      ON me.organization_id = them.organization_id
    WHERE me.user_id = auth.uid()
      AND them.user_id = other
  );
END;
$$;

-- Replace the permissive "read all profiles" policy with an org-scoped one.
DROP POLICY IF EXISTS "profiles: authenticated users can read all" ON public.profiles;

CREATE POLICY "profiles: read own and same-org profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR shares_org(id)
  );

GRANT EXECUTE ON FUNCTION shares_org(uuid) TO authenticated;
