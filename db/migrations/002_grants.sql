-- ================================================================
-- AgencyOS — 002_grants.sql
-- Role privileges for the Supabase API roles.
-- Run in: Supabase Dashboard > SQL Editor (AFTER 001_initial_schema.sql)
-- ================================================================
--
-- WHY THIS MIGRATION EXISTS
-- -------------------------
-- Postgres security has two independent layers:
--
--   1. GRANT  — may this role touch the table AT ALL? (table-level privilege)
--   2. RLS    — WHICH ROWS of that table may it touch?  (row-level policy)
--
-- 001_initial_schema.sql set up layer 2 (RLS + policies) correctly, but never
-- granted layer 1. Supabase normally applies these grants automatically through
-- "default privileges", but tables created through the SQL Editor did not inherit
-- them. The result: every query — even from the service_role key — failed with
-- "permission denied for table ..." (SQLSTATE 42501).
--
-- This migration grants the table-level privileges each role needs. RLS still
-- governs every row, so granting broadly to `authenticated` is safe: a role with
-- INSERT privilege but no matching INSERT policy is still denied by RLS.
-- ================================================================


-- --- Schema access -------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;


-- --- service_role --------------------------------------------------
-- Full backend access. Bypasses RLS. Used by the admin client (onboarding
-- bootstrap) and the Stripe webhook handler. Still needs table GRANTs.
GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;


-- --- authenticated -------------------------------------------------
-- Logged-in users. Table access is granted here, but every row is still gated
-- by the RLS policies in 001 (membership + role checks). Where a table has no
-- policy for an operation (e.g. INSERT on organizations/audit_logs), RLS denies
-- it regardless of this grant.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
-- EXECUTE lets RLS policies call the is_org_member() / get_org_role() helpers.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;


-- --- anon ----------------------------------------------------------
-- No table access: the entire application requires authentication. If a public
-- page is ever needed, add a targeted GRANT + RLS policy for it explicitly.


-- --- Future objects ------------------------------------------------
-- So tables/functions added later inherit the same grants automatically and we
-- never hit this "permission denied" problem again.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON FUNCTIONS TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO authenticated;
