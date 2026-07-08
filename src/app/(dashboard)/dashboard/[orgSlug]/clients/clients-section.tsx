'use client'

import { useEffect, useState, useTransition, useActionState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  createClient,
  updateClient,
  deleteClient,
  type ClientFormState,
} from './actions'

export type ClientStatus = 'active' | 'inactive' | 'archived'

export type ClientRow = {
  id: string
  name: string
  email: string | null
  company: string | null
  status: ClientStatus
}

const STATUS_TABS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'archived', label: 'Archived' },
]

const STATUS_STYLES: Record<ClientStatus, string> = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-yellow-100 text-yellow-800',
  archived: 'bg-gray-200 text-gray-700',
}

export function ClientsSection({
  orgSlug,
  clients,
  activeFilter,
  canCreate,
  canUpdate,
  canDelete,
}: {
  orgSlug: string
  clients: ClientRow[]
  activeFilter: string
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}) {
  const [editing, setEditing] = useState<null | 'new' | ClientRow>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeleting, startDelete] = useTransition()

  function handleDelete(id: string) {
    if (!window.confirm('Delete this client? This cannot be undone.')) return
    setDeleteError(null)
    startDelete(async () => {
      const res = await deleteClient(orgSlug, id)
      if ('error' in res) setDeleteError(res.error)
    })
  }

  const showActions = canUpdate || canDelete

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clients</h1>
          <p className="text-muted-foreground text-sm">
            Manage the clients for this organization.
          </p>
        </div>
        {canCreate && editing === null && (
          <Button onClick={() => setEditing('new')}>New client</Button>
        )}
      </div>

      <div className="flex gap-2 text-sm">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={tab.value === 'all' ? '?' : `?status=${tab.value}`}
            className={cn(
              'px-3 py-1 rounded-md border transition-colors',
              activeFilter === tab.value
                ? 'bg-foreground text-background'
                : 'hover:bg-muted'
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {deleteError && (
        <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
          {deleteError}
        </p>
      )}

      {editing !== null && (
        <ClientForm
          key={editing === 'new' ? 'new' : editing.id}
          orgSlug={orgSlug}
          client={editing === 'new' ? null : editing}
          onDone={() => setEditing(null)}
        />
      )}

      {clients.length === 0 ? (
        <div className="border border-dashed rounded-lg p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {activeFilter === 'all'
              ? 'No clients yet.'
              : `No ${activeFilter} clients.`}
          </p>
          {canCreate && activeFilter === 'all' && (
            <Button className="mt-4" onClick={() => setEditing('new')}>
              Add your first client
            </Button>
          )}
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Company</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Status</th>
                {showActions && (
                  <th className="px-4 py-2 font-medium text-right">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-4 py-2 font-medium">{c.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {c.company ?? '—'}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {c.email ?? '—'}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        'inline-block px-2 py-0.5 rounded-full text-xs capitalize',
                        STATUS_STYLES[c.status]
                      )}
                    >
                      {c.status}
                    </span>
                  </td>
                  {showActions && (
                    <td className="px-4 py-2 text-right space-x-2 whitespace-nowrap">
                      {canUpdate && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditing(c)}
                        >
                          Edit
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isDeleting}
                          onClick={() => handleDelete(c.id)}
                        >
                          Delete
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ClientForm({
  orgSlug,
  client,
  onDone,
}: {
  orgSlug: string
  client: ClientRow | null
  onDone: () => void
}) {
  const action = client ? updateClient : createClient
  const [state, formAction, pending] = useActionState<ClientFormState, FormData>(
    action,
    null
  )

  // Close the form once the server action reports success.
  useEffect(() => {
    if (state && 'success' in state) onDone()
  }, [state, onDone])

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <h2 className="font-medium">{client ? 'Edit client' : 'New client'}</h2>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="orgSlug" value={orgSlug} />
        {client && <input type="hidden" name="clientId" value={client.id} />}

        {state && 'error' in state && (
          <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
            {state.error}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              defaultValue={client?.name ?? ''}
              placeholder="Acme Inc."
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company">Company</Label>
            <Input
              id="company"
              name="company"
              defaultValue={client?.company ?? ''}
              placeholder="Acme Holdings"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={client?.email ?? ''}
              placeholder="hello@acme.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              name="status"
              defaultValue={client?.status ?? 'active'}
              className="w-full border rounded-md px-3 py-2 bg-background text-sm"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : client ? 'Save changes' : 'Create client'}
          </Button>
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
