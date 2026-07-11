# AgencyOS — Testing Checklist

A manual QA + security pass covering the important flows. Each item was
verified against the running app (Next.js 16 + Supabase). This is not an
automated suite — it's the "does the demo hold up, and is tenant data safe"
checklist. Re-run with the demo accounts from `db/seed.mjs`.

Legend: **[x]** verified · evidence in italics.

---

## 1. Auth & protected routes
- [x] Sign up creates an account and session _(email confirmation off for dev)_
- [x] Log in / log out work
- [x] Unauthenticated `/dashboard/*` → redirects to `/login` _(proxy.ts guard)_
- [x] Authenticated `/login` / `/signup` → redirect back into the app
- [x] Logged-out invitee is sent to `/login?next=/invite/[token]` and returns after auth

## 2. Organizations & multi-tenancy
- [x] Onboarding creates an org + owner membership atomically _(SECURITY DEFINER `create_organization`)_
- [x] `/dashboard` routes to the user's first org, or onboarding if none
- [x] Membership guard: visiting an org you don't belong to → **404** _(requireOrgMembership)_
- [x] A user with multiple orgs is scoped correctly (workspace vs taylor-media)

## 3. Roles & permissions (tested per role — not just Owner)
- [x] **Owner** — full access incl. Billing / Settings / Audit Logs
- [x] **Admin** — manage data + audit logs, no billing/settings
- [x] **Member** — create/edit clients/projects/tasks, no admin areas
- [x] **Viewer** — read-only: no New/Edit/Delete controls, no Actions column, owner-only nav hidden _(verified with `demo-viewer`)_
- [x] UI gating **and** server enforcement — a viewer's direct-API write is rejected by RLS (`42501` / 403)
- [x] Last-owner protection: the final owner can't be demoted or removed

## 4. Tenant isolation (the core security property)
- [x] RLS enabled on all 9 tenant tables with SELECT/INSERT/UPDATE/DELETE policies
- [x] **DB-level, not just UI:** using a real session token, a member of Org A querying Org B's
      clients/projects/tasks by exact `organization_id` → returns `[]`
- [x] Querying another org's row by its exact `id` → still `[]` (no leak even with the id)
- [x] A viewer's direct-API privilege escalation (self-promote to owner) → `0 rows changed`
- [x] Cross-org input guards: a project can't link another org's client; a task can't be
      assigned to a non-member _(server re-validates)_
- [x] Profile visibility is org-scoped — you can only read profiles of people you share an org with

## 5. Invites
- [x] Owner/Admin creates an invite → one-time copyable link (only the token **hash** is stored)
- [x] Accept flow: sign up as the invited email → joins the org with the assigned role
- [x] Email match required — wrong account sees "This invite was sent to …"
- [x] Already-accepted link → "Invite already used"
- [x] Expired link → "Invite expired" _(verified live with a back-dated `expires_at`)_
- [x] Invalid token → "Invalid invite"
- [x] Duplicate-member and duplicate-pending-invite guards
- [x] Revoke removes a pending invite
- [x] Member limit enforced at invite time **and** as a hard backstop at acceptance

## 6. Billing (Stripe sandbox)
- [x] Owner-only Billing page shows plan + usage + plan cards
- [x] Checkout session creation works (Stripe customer created)
- [x] **Webhook is the source of truth** — signature verified on the raw body (`whsec_`), events return `200`
- [x] A paid subscription event flips `subscriptions.plan` → the Billing page reflects "Pro (active)"
- [x] Secret key + webhook secret stay server-side (env only)

## 7. Plan limits (server-side)
- [x] Free plan blocks the 4th client/project with a clear "upgrade in Billing" message
- [x] The blocked create does **not** persist (count unchanged)
- [x] Paid plans (Pro/Business) lift the limits (unlimited clients/projects)
- [x] Usage shown against limits on the Billing page

## 8. Code quality & secrets
- [x] `next build` compiles all routes; **TypeScript: 0 errors** (`tsc --noEmit` exit 0)
- [x] **ESLint: clean**
- [x] **No secrets in the repo** — only `.env.example` (placeholders) is tracked; `.env.local`
      was never committed; a scan across all history found zero Stripe/Supabase/webhook secrets
- [x] `.claude/` is never staged; service-role & Stripe keys live only in `.env.local`

## 9. UX states
- [x] Empty states with a create prompt on every list
- [x] Loading states on form submits ("Saving…", disabled buttons)
- [x] Confirmation on destructive deletes
- [x] No raw JSON / stack traces surfaced to users — friendly error messages
