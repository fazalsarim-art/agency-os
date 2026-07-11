// ================================================================
// AgencyOS demo seed
// ----------------------------------------------------------------
// Creates a polished demo organization ("Acme Studio") with realistic
// clients / projects / tasks, four demo login accounts (Owner / Admin /
// Member / Viewer), a Pro subscription, and some audit-log history.
//
// Idempotent: it wipes any previous demo (org + demo users) first, so it is
// safe to re-run to refresh the demo state.
//
// Run from the agency-os folder:  node db/seed.mjs
//
// Uses the Supabase SERVICE ROLE key (server-only) from .env.local — it
// bypasses RLS and can create auth users. All data below is fake.
// ================================================================
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim()

const admin = createClient(
  get('NEXT_PUBLIC_SUPABASE_URL'),
  get('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const ORG = { name: 'Acme Studio', slug: 'acme-studio' }
const PASSWORD = 'DemoPass123!'
const ACCOUNTS = [
  { email: 'demo-owner@agencyos.dev', full_name: 'Sam Rivera', role: 'owner' },
  { email: 'demo-admin@agencyos.dev', full_name: 'Alex Chen', role: 'admin' },
  { email: 'demo-member@agencyos.dev', full_name: 'Jordan Blake', role: 'member' },
  { email: 'demo-viewer@agencyos.dev', full_name: 'Riley Morgan', role: 'viewer' },
]

const iso = (d) => new Date(d).toISOString().slice(0, 10)
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString()

async function findUserByEmail(email) {
  let page = 1
  for (;;) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    const u = data.users.find((x) => x.email === email)
    if (u) return u
    if (data.users.length < 200) return null
    page++
  }
}

async function main() {
  // 1. Wipe any previous demo (org cascade + demo users cascade their profiles).
  console.log('Cleaning previous demo…')
  await admin.from('organizations').delete().eq('slug', ORG.slug)
  for (const a of ACCOUNTS) {
    const existing = await findUserByEmail(a.email)
    if (existing) await admin.auth.admin.deleteUser(existing.id)
  }

  // 2. Demo accounts (email pre-confirmed so they can log in immediately).
  console.log('Creating demo accounts…')
  const uid = {}
  for (const a of ACCOUNTS) {
    const { data, error } = await admin.auth.admin.createUser({
      email: a.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: a.full_name },
    })
    if (error) throw new Error(`createUser ${a.email}: ${error.message}`)
    uid[a.role] = data.user.id
  }

  // 3. Org, memberships, and a Pro subscription.
  console.log('Creating org, members, subscription…')
  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .insert({ name: ORG.name, slug: ORG.slug, created_by: uid.owner })
    .select('id')
    .single()
  if (orgErr) throw new Error(orgErr.message)
  const orgId = org.id

  await admin.from('organization_members').insert(
    ACCOUNTS.map((a) => ({ organization_id: orgId, user_id: uid[a.role], role: a.role }))
  )
  await admin
    .from('subscriptions')
    .insert({ organization_id: orgId, plan: 'pro', status: 'active' })

  // 4. Clients.
  const { data: clients, error: cErr } = await admin
    .from('clients')
    .insert([
      { organization_id: orgId, name: 'Northwind Traders', company: 'Northwind', email: 'hello@northwind.example', status: 'active' },
      { organization_id: orgId, name: 'Initech', company: 'Initech LLC', email: 'contact@initech.example', status: 'active' },
      { organization_id: orgId, name: 'Umbrella Corp', company: 'Umbrella', email: 'info@umbrella.example', status: 'inactive' },
    ])
    .select('id, name')
  if (cErr) throw new Error(cErr.message)
  const client = Object.fromEntries(clients.map((c) => [c.name, c.id]))

  // 5. Projects (linked to clients, across statuses).
  const { data: projects, error: pErr } = await admin
    .from('projects')
    .insert([
      { organization_id: orgId, client_id: client['Northwind Traders'], name: 'Website Redesign', description: 'Full marketing-site refresh.', status: 'active', due_date: iso('2026-09-30') },
      { organization_id: orgId, client_id: client['Initech'], name: 'Mobile App Launch', description: 'iOS + Android v1.', status: 'active', due_date: iso('2026-10-15') },
      { organization_id: orgId, client_id: client['Northwind Traders'], name: 'Brand Refresh', description: 'New logo and guidelines.', status: 'completed' },
      { organization_id: orgId, client_id: client['Umbrella Corp'], name: 'Legacy Migration', description: 'Move off the old CMS.', status: 'archived' },
    ])
    .select('id, name')
  if (pErr) throw new Error(pErr.message)
  const project = Object.fromEntries(projects.map((p) => [p.name, p.id]))

  // 6. Tasks (linked to projects, assigned to members, across statuses).
  const { error: tErr } = await admin.from('tasks').insert([
    { organization_id: orgId, project_id: project['Website Redesign'], title: 'Design homepage mockups', status: 'in_progress', assigned_to: uid.owner, due_date: iso('2026-08-20') },
    { organization_id: orgId, project_id: project['Website Redesign'], title: 'QA testing pass', status: 'todo', assigned_to: uid.member, due_date: iso('2026-09-10') },
    { organization_id: orgId, project_id: project['Website Redesign'], title: 'Review Q3 analytics', status: 'done', assigned_to: uid.owner },
    { organization_id: orgId, project_id: project['Mobile App Launch'], title: 'Set up CI pipeline', status: 'todo', assigned_to: uid.admin, due_date: iso('2026-08-25') },
    { organization_id: orgId, project_id: project['Mobile App Launch'], title: 'Write API documentation', status: 'in_progress', assigned_to: uid.member },
    { organization_id: orgId, project_id: project['Brand Refresh'], title: 'Finalize brand guidelines', status: 'done', assigned_to: uid.admin },
    { organization_id: orgId, project_id: project['Legacy Migration'], title: 'Export legacy data', status: 'todo', assigned_to: uid.member },
  ])
  if (tErr) throw new Error(tErr.message)

  // 7. Audit-log history.
  await admin.from('audit_logs').insert([
    { organization_id: orgId, actor_user_id: uid.owner, action: 'client.created', target_type: 'client', metadata: { name: 'Northwind Traders' }, created_at: daysAgo(6) },
    { organization_id: orgId, actor_user_id: uid.owner, action: 'project.created', target_type: 'project', metadata: { name: 'Website Redesign' }, created_at: daysAgo(6) },
    { organization_id: orgId, actor_user_id: uid.admin, action: 'task.created', target_type: 'task', metadata: { title: 'Set up CI pipeline' }, created_at: daysAgo(4) },
    { organization_id: orgId, actor_user_id: uid.owner, action: 'member.role_changed', target_type: 'member', target_id: uid.member, metadata: { newRole: 'member', previousRole: 'viewer' }, created_at: daysAgo(3) },
    { organization_id: orgId, actor_user_id: uid.admin, action: 'client.created', target_type: 'client', metadata: { name: 'Initech' }, created_at: daysAgo(2) },
  ])

  console.log('\n✅ Demo seeded.')
  console.log(
    JSON.stringify(
      {
        org: `${ORG.name} (/dashboard/${ORG.slug})`,
        plan: 'pro',
        clients: clients.length,
        projects: projects.length,
        tasks: 7,
        accounts: ACCOUNTS.map((a) => `${a.email} / ${PASSWORD} — ${a.role}`),
      },
      null,
      2
    )
  )
}

main().catch((e) => {
  console.error('Seed failed:', e)
  process.exit(1)
})
