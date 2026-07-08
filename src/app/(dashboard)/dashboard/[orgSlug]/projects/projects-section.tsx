'use client'

import { useEffect, useState, useTransition, useActionState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  createProject,
  updateProject,
  deleteProject,
  type ProjectFormState,
} from './actions'

export type ProjectStatus = 'active' | 'completed' | 'archived'

export type ProjectRow = {
  id: string
  name: string
  description: string | null
  status: ProjectStatus
  dueDate: string | null
  clientId: string | null
  clientName: string | null
}

export type ClientOption = { id: string; name: string }

const STATUS_TABS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
]

const STATUS_STYLES: Record<ProjectStatus, string> = {
  active: 'bg-green-100 text-green-800',
  completed: 'bg-blue-100 text-blue-800',
  archived: 'bg-gray-200 text-gray-700',
}

export function ProjectsSection({
  orgSlug,
  projects,
  clientOptions,
  activeFilter,
  canCreate,
  canUpdate,
  canDelete,
}: {
  orgSlug: string
  projects: ProjectRow[]
  clientOptions: ClientOption[]
  activeFilter: string
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}) {
  const [editing, setEditing] = useState<null | 'new' | ProjectRow>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeleting, startDelete] = useTransition()

  function handleDelete(id: string) {
    if (!window.confirm('Delete this project? This cannot be undone.')) return
    setDeleteError(null)
    startDelete(async () => {
      const res = await deleteProject(orgSlug, id)
      if ('error' in res) setDeleteError(res.error)
    })
  }

  const showActions = canUpdate || canDelete

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-muted-foreground text-sm">
            Track the projects for this organization.
          </p>
        </div>
        {canCreate && editing === null && (
          <Button onClick={() => setEditing('new')}>New project</Button>
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
        <ProjectForm
          key={editing === 'new' ? 'new' : editing.id}
          orgSlug={orgSlug}
          project={editing === 'new' ? null : editing}
          clientOptions={clientOptions}
          onDone={() => setEditing(null)}
        />
      )}

      {projects.length === 0 ? (
        <div className="border border-dashed rounded-lg p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {activeFilter === 'all'
              ? 'No projects yet.'
              : `No ${activeFilter} projects.`}
          </p>
          {canCreate && activeFilter === 'all' && (
            <Button className="mt-4" onClick={() => setEditing('new')}>
              Create your first project
            </Button>
          )}
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Due</th>
                {showActions && (
                  <th className="px-4 py-2 font-medium text-right">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-2 font-medium">{p.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {p.clientName ?? '—'}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        'inline-block px-2 py-0.5 rounded-full text-xs capitalize',
                        STATUS_STYLES[p.status]
                      )}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {p.dueDate ?? '—'}
                  </td>
                  {showActions && (
                    <td className="px-4 py-2 text-right space-x-2 whitespace-nowrap">
                      {canUpdate && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditing(p)}
                        >
                          Edit
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isDeleting}
                          onClick={() => handleDelete(p.id)}
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

function ProjectForm({
  orgSlug,
  project,
  clientOptions,
  onDone,
}: {
  orgSlug: string
  project: ProjectRow | null
  clientOptions: ClientOption[]
  onDone: () => void
}) {
  const action = project ? updateProject : createProject
  const [state, formAction, pending] = useActionState<ProjectFormState, FormData>(
    action,
    null
  )

  useEffect(() => {
    if (state && 'success' in state) onDone()
  }, [state, onDone])

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <h2 className="font-medium">{project ? 'Edit project' : 'New project'}</h2>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="orgSlug" value={orgSlug} />
        {project && <input type="hidden" name="projectId" value={project.id} />}

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
              defaultValue={project?.name ?? ''}
              placeholder="Website redesign"
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="clientId">Client</Label>
            <select
              id="clientId"
              name="clientId"
              defaultValue={project?.clientId ?? ''}
              className="w-full border rounded-md px-3 py-2 bg-background text-sm"
            >
              <option value="">— No client —</option>
              {clientOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              name="status"
              defaultValue={project?.status ?? 'active'}
              className="w-full border rounded-md px-3 py-2 bg-background text-sm"
            >
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dueDate">Due date</Label>
            <Input
              id="dueDate"
              name="dueDate"
              type="date"
              defaultValue={project?.dueDate ?? ''}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <textarea
            id="description"
            name="description"
            defaultValue={project?.description ?? ''}
            rows={3}
            placeholder="Short summary of the project…"
            className="w-full border rounded-md px-3 py-2 bg-background text-sm"
          />
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : project ? 'Save changes' : 'Create project'}
          </Button>
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
