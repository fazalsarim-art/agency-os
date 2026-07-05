-- ================================================================
-- AgencyOS — 003_create_organization_fn.sql
-- Atomic organization creation (org + owner membership in one txn).
-- Run in: Supabase Dashboard > SQL Editor (AFTER 002_grants.sql)
-- ================================================================
--
-- WHY THIS EXISTS
-- ---------------
-- Onboarding creates two rows: the organization, and the creator's "owner"
-- membership. Doing that as two separate client calls is NOT atomic — if the
-- second insert fails, an orphan org with no owner is left behind. It also
-- required the service-role key on a user-facing path.
--
-- This SECURITY DEFINER function performs both inserts in a single transaction
-- using the caller's own identity (auth.uid()), so:
--   * both rows commit together or not at all (no orphans),
--   * the org is always created for the actual logged-in user (auth.uid can't
--     be spoofed by the client),
--   * onboarding no longer needs the service-role key.
--
-- The final slug is chosen inside the function, retrying with -2, -3, … on
-- collision, so two concurrent signups can never fail on a duplicate slug.
-- Returns the slug that was actually used (for the post-signup redirect).
-- ================================================================

CREATE OR REPLACE FUNCTION public.create_organization(org_name text, base_slug text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_org_id    uuid;
  v_base      text;
  v_candidate text;
  v_suffix    int := 1;
BEGIN
  -- Must be called by a logged-in user
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF org_name IS NULL OR length(btrim(org_name)) < 2 THEN
    RAISE EXCEPTION 'Organization name must be at least 2 characters';
  END IF;

  -- Fall back to a default when the name has no slug-able characters
  v_base := NULLIF(btrim(base_slug), '');
  IF v_base IS NULL THEN
    v_base := 'workspace';
  END IF;

  v_candidate := v_base;

  -- Insert the org, retrying with a numeric suffix if the slug is already taken
  LOOP
    BEGIN
      INSERT INTO public.organizations (name, slug, created_by)
      VALUES (btrim(org_name), v_candidate, v_uid)
      RETURNING id INTO v_org_id;
      EXIT;  -- inserted successfully
    EXCEPTION WHEN unique_violation THEN
      v_suffix := v_suffix + 1;
      v_candidate := v_base || '-' || v_suffix;
    END;
  END LOOP;

  -- Add the creator as owner — same transaction, so it can't be orphaned
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org_id, v_uid, 'owner');

  RETURN v_candidate;
END;
$$;

-- Logged-in users may call it. (Redundant with the default privileges set in
-- 002_grants.sql, but explicit here so the intent is obvious.)
GRANT EXECUTE ON FUNCTION public.create_organization(text, text) TO authenticated;
