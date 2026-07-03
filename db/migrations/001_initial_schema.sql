-- ================================================================
-- AgencyOS Initial Database Schema
-- Run this in: Supabase Dashboard > SQL Editor
-- ================================================================


-- ================================================================
-- HELPER FUNCTIONS
-- ================================================================

-- Auto-updates the updated_at column on any table
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Returns true if the current user is a member of the given org
CREATE OR REPLACE FUNCTION is_org_member(org_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = org_id AND user_id = auth.uid()
  );
END;
$$;

-- Returns the current user's role in the given org (or NULL if not a member)
CREATE OR REPLACE FUNCTION get_org_role(org_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
DECLARE
  v_role text;
BEGIN
  SELECT role INTO v_role FROM public.organization_members
  WHERE organization_id = org_id AND user_id = auth.uid()
  LIMIT 1;
  RETURN v_role;
END;
$$;


-- ================================================================
-- PROFILES
-- ================================================================

CREATE TABLE public.profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz DEFAULT NOW() NOT NULL,
  updated_at  timestamptz DEFAULT NOW() NOT NULL
);

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auto-create a profile row whenever a new auth user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles: authenticated users can read all"
  ON public.profiles FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "profiles: users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles: users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());


-- ================================================================
-- ORGANIZATIONS
-- ================================================================

CREATE TABLE public.organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT NOW() NOT NULL,
  updated_at  timestamptz DEFAULT NOW() NOT NULL
);

CREATE TRIGGER set_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organizations: members can read their org"
  ON public.organizations FOR SELECT TO authenticated
  USING (is_org_member(id));

-- Insert is done server-side with service role during onboarding
-- authenticated insert is blocked intentionally; use server action

CREATE POLICY "organizations: only owners can update"
  ON public.organizations FOR UPDATE TO authenticated
  USING (get_org_role(id) = 'owner');

CREATE POLICY "organizations: only owners can delete"
  ON public.organizations FOR DELETE TO authenticated
  USING (get_org_role(id) = 'owner');


-- ================================================================
-- ORGANIZATION_MEMBERS
-- ================================================================

CREATE TABLE public.organization_members (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role             text NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at       timestamptz DEFAULT NOW() NOT NULL,
  UNIQUE (organization_id, user_id)
);

CREATE INDEX idx_org_members_user_id ON public.organization_members(user_id);
CREATE INDEX idx_org_members_org_id  ON public.organization_members(organization_id);

-- RLS
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members: members can read other members of same org"
  ON public.organization_members FOR SELECT TO authenticated
  USING (is_org_member(organization_id));

-- Insert managed server-side; owners/admins can add via server action
CREATE POLICY "org_members: owners and admins can add members"
  ON public.organization_members FOR INSERT TO authenticated
  WITH CHECK (get_org_role(organization_id) IN ('owner', 'admin'));

CREATE POLICY "org_members: only owners can change roles"
  ON public.organization_members FOR UPDATE TO authenticated
  USING (get_org_role(organization_id) = 'owner');

CREATE POLICY "org_members: owners can remove members (not themselves)"
  ON public.organization_members FOR DELETE TO authenticated
  USING (
    get_org_role(organization_id) = 'owner'
    AND user_id != auth.uid()
  );


-- ================================================================
-- INVITES
-- ================================================================

CREATE TABLE public.invites (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email            text NOT NULL,
  role             text NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
  token_hash       text NOT NULL UNIQUE,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  expires_at       timestamptz NOT NULL,
  created_by       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  accepted_at      timestamptz,
  created_at       timestamptz DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_invites_token_hash ON public.invites(token_hash);
CREATE INDEX idx_invites_email      ON public.invites(email);
CREATE INDEX idx_invites_org_id     ON public.invites(organization_id);

-- RLS
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invites: org members can read invites"
  ON public.invites FOR SELECT TO authenticated
  USING (is_org_member(organization_id));

CREATE POLICY "invites: owners and admins can create invites"
  ON public.invites FOR INSERT TO authenticated
  WITH CHECK (get_org_role(organization_id) IN ('owner', 'admin'));

CREATE POLICY "invites: owners and admins can update invites"
  ON public.invites FOR UPDATE TO authenticated
  USING (get_org_role(organization_id) IN ('owner', 'admin'));

CREATE POLICY "invites: owners and admins can delete invites"
  ON public.invites FOR DELETE TO authenticated
  USING (get_org_role(organization_id) IN ('owner', 'admin'));


-- ================================================================
-- CLIENTS
-- ================================================================

CREATE TABLE public.clients (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name             text NOT NULL,
  email            text,
  company          text,
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at       timestamptz DEFAULT NOW() NOT NULL,
  updated_at       timestamptz DEFAULT NOW() NOT NULL
);

CREATE TRIGGER set_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_clients_org_id ON public.clients(organization_id);

-- RLS
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients: org members can read"
  ON public.clients FOR SELECT TO authenticated
  USING (is_org_member(organization_id));

CREATE POLICY "clients: owners, admins, members can create"
  ON public.clients FOR INSERT TO authenticated
  WITH CHECK (get_org_role(organization_id) IN ('owner', 'admin', 'member'));

CREATE POLICY "clients: owners, admins, members can update"
  ON public.clients FOR UPDATE TO authenticated
  USING (get_org_role(organization_id) IN ('owner', 'admin', 'member'));

CREATE POLICY "clients: only owners and admins can delete"
  ON public.clients FOR DELETE TO authenticated
  USING (get_org_role(organization_id) IN ('owner', 'admin'));


-- ================================================================
-- PROJECTS
-- ================================================================

CREATE TABLE public.projects (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id        uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  name             text NOT NULL,
  description      text,
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  due_date         date,
  created_at       timestamptz DEFAULT NOW() NOT NULL,
  updated_at       timestamptz DEFAULT NOW() NOT NULL
);

CREATE TRIGGER set_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_projects_org_id    ON public.projects(organization_id);
CREATE INDEX idx_projects_client_id ON public.projects(client_id);

-- RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projects: org members can read"
  ON public.projects FOR SELECT TO authenticated
  USING (is_org_member(organization_id));

CREATE POLICY "projects: owners, admins, members can create"
  ON public.projects FOR INSERT TO authenticated
  WITH CHECK (get_org_role(organization_id) IN ('owner', 'admin', 'member'));

CREATE POLICY "projects: owners, admins, members can update"
  ON public.projects FOR UPDATE TO authenticated
  USING (get_org_role(organization_id) IN ('owner', 'admin', 'member'));

CREATE POLICY "projects: only owners and admins can delete"
  ON public.projects FOR DELETE TO authenticated
  USING (get_org_role(organization_id) IN ('owner', 'admin'));


-- ================================================================
-- TASKS
-- ================================================================

CREATE TABLE public.tasks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id       uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  title            text NOT NULL,
  description      text,
  status           text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  assigned_to      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date         date,
  created_at       timestamptz DEFAULT NOW() NOT NULL,
  updated_at       timestamptz DEFAULT NOW() NOT NULL
);

CREATE TRIGGER set_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_tasks_org_id      ON public.tasks(organization_id);
CREATE INDEX idx_tasks_project_id  ON public.tasks(project_id);
CREATE INDEX idx_tasks_assigned_to ON public.tasks(assigned_to);

-- RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks: org members can read"
  ON public.tasks FOR SELECT TO authenticated
  USING (is_org_member(organization_id));

CREATE POLICY "tasks: owners, admins, members can create"
  ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (get_org_role(organization_id) IN ('owner', 'admin', 'member'));

CREATE POLICY "tasks: owners, admins, members can update"
  ON public.tasks FOR UPDATE TO authenticated
  USING (get_org_role(organization_id) IN ('owner', 'admin', 'member'));

CREATE POLICY "tasks: only owners and admins can delete"
  ON public.tasks FOR DELETE TO authenticated
  USING (get_org_role(organization_id) IN ('owner', 'admin'));


-- ================================================================
-- AUDIT_LOGS
-- ================================================================

CREATE TABLE public.audit_logs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action           text NOT NULL,
  target_type      text,
  target_id        uuid,
  metadata         jsonb,
  created_at       timestamptz DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_audit_logs_org_id     ON public.audit_logs(organization_id);
CREATE INDEX idx_audit_logs_actor      ON public.audit_logs(actor_user_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only owners and admins can read audit logs
CREATE POLICY "audit_logs: owners and admins can read"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (
    is_org_member(organization_id)
    AND get_org_role(organization_id) IN ('owner', 'admin')
  );

-- Audit logs are inserted server-side only via service role key.
-- No authenticated INSERT/UPDATE/DELETE policies are created intentionally.


-- ================================================================
-- SUBSCRIPTIONS
-- ================================================================

CREATE TABLE public.subscriptions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  stripe_customer_id      text UNIQUE,
  stripe_subscription_id  text UNIQUE,
  plan                    text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'business')),
  status                  text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'trialing', 'incomplete')),
  current_period_end      timestamptz,
  created_at              timestamptz DEFAULT NOW() NOT NULL,
  updated_at              timestamptz DEFAULT NOW() NOT NULL
);

CREATE TRIGGER set_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_subscriptions_stripe_customer ON public.subscriptions(stripe_customer_id);

-- RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Org members can see their own subscription
CREATE POLICY "subscriptions: org members can read"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (is_org_member(organization_id));

-- Subscriptions are written only by the Stripe webhook handler via service role key.
-- No authenticated INSERT/UPDATE/DELETE policies are created intentionally.
