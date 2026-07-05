// ================================================================
// AgencyOS — Role-Based Access Control (RBAC)
// ================================================================
// This is the SINGLE source of truth for "which role can do what".
//
// Three layers enforce access in this app, and they must agree:
//   1. UI          — hide/disable controls a role can't use (this file)
//   2. Server      — every server action re-checks with hasPermission (this file)
//   3. Database    — RLS policies mirror this matrix as the final backstop
//
// The UI check is for user experience. The server + database checks are the
// actual security boundary — a request can always be sent without the UI.
// ================================================================

export const ROLES = ['owner', 'admin', 'member', 'viewer'] as const
export type Role = (typeof ROLES)[number]

// Every distinct capability in the app, named "<resource>:<action>".
export type Permission =
  | 'members:view'
  | 'members:manage' // change roles / remove members
  | 'members:invite' // create invites (used in a later step)
  | 'billing:manage'
  | 'organization:manage' // rename / delete org, settings
  | 'clients:view'
  | 'clients:create'
  | 'clients:update'
  | 'clients:delete'
  | 'projects:view'
  | 'projects:create'
  | 'projects:update'
  | 'projects:delete'
  | 'tasks:view'
  | 'tasks:create'
  | 'tasks:update'
  | 'tasks:delete'
  | 'auditLogs:view'

// The permission matrix. Kept in one place so the rules are easy to audit.
// (Mirrors the RLS policies defined in db/migrations/001_initial_schema.sql.)
const MATRIX: Record<Permission, readonly Role[]> = {
  'members:view': ['owner', 'admin', 'member', 'viewer'],
  'members:manage': ['owner'],
  'members:invite': ['owner', 'admin'],
  'billing:manage': ['owner'],
  'organization:manage': ['owner'],

  'clients:view': ['owner', 'admin', 'member', 'viewer'],
  'clients:create': ['owner', 'admin', 'member'],
  'clients:update': ['owner', 'admin', 'member'],
  'clients:delete': ['owner', 'admin'],

  'projects:view': ['owner', 'admin', 'member', 'viewer'],
  'projects:create': ['owner', 'admin', 'member'],
  'projects:update': ['owner', 'admin', 'member'],
  'projects:delete': ['owner', 'admin'],

  'tasks:view': ['owner', 'admin', 'member', 'viewer'],
  'tasks:create': ['owner', 'admin', 'member'],
  'tasks:update': ['owner', 'admin', 'member'],
  'tasks:delete': ['owner', 'admin'],

  'auditLogs:view': ['owner', 'admin'],
}

// The one helper every UI component and server action should use.
export function hasPermission(role: Role, permission: Permission): boolean {
  return MATRIX[permission].includes(role)
}

// True if the given string is one of our known roles.
export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value)
}

// Human-friendly labels for the UI.
export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
}
