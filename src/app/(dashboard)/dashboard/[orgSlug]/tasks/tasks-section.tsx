'use client'

import { useEffect, useState, useTransition, useActionState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createTask, updateTask, deleteTask, type TaskFormState } from './actions'

export type TaskStatus = 'todo' | 'in_progress' | 'done'

export type TaskRow = {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  dueDate: string | null
  projectId: string | null
  projectName: string | null
  assignedTo: string | null
  assigneeName: string | null
}

export type ProjectOption = { id: string; name: string }
export type MemberOption = { userId: string; name: string }

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
}

const STATUS_STYLES: Record<TaskStatus, string> = {
  todo: 'bg-gray-200 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-800',
  done: 'bg-green-100 text-green-800',
}

const STATUS_TABS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
]

export function TasksSection({
  orgSlug,
  tasks,
  projectOptions,
  memberOptions,
  activeFilter,
  canCreate,
  canUpdate,
  canDelete,
}: {
  orgSlug: string
  tasks: TaskRow[]
  projectOptions: ProjectOption[]
  memberOptions: MemberOption[]
  activeFilter: string
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
}) {
  const [editing, setEditing] = useState<null | 'new' | TaskRow>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeleting, startDelete] = useTransition()

  function handleDelete(id: string) {
    if (!window.confirm('Delete this task? This cannot be undone.')) return
    setDeleteError(null)
    startDelete(async () => {
      const res = await deleteTask(orgSlug, id)
      if ('error' in res) setDeleteError(res.error)
    })
  }

  const showActions = canUpdate || canDelete

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tasks</h1>
          <p className="text-muted-foreground text-sm">
            Track the work for this organization.
          </p>
        </div>
        {canCreate && editing === null && (
          <Button onClick={() => setEditing('new')}>New task</Button>
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
        <TaskForm
          key={editing === 'new' ? 'new' : editing.id}
          orgSlug={orgSlug}
          task={editing === 'new' ? null : editing}
          projectOptions={projectOptions}
          memberOptions={memberOptions}
          onDone={() => setEditing(null)}
        />
      )}

      {tasks.length === 0 ? (
        <div className="border border-dashed rounded-lg p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {activeFilter === 'all'
              ? 'No tasks yet.'
              : `No ${STATUS_LABELS[activeFilter as TaskStatus]?.toLowerCase() ?? activeFilter} tasks.`}
          </p>
          {canCreate && activeFilter === 'all' && (
            <Button className="mt-4" onClick={() => setEditing('new')}>
              Create your first task
            </Button>
          )}
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Title</th>
                <th className="px-4 py-2 font-medium">Project</th>
                <th className="px-4 py-2 font-medium">Assignee</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Due</th>
                {showActions && (
                  <th className="px-4 py-2 font-medium text-right">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="px-4 py-2 font-medium">{t.title}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {t.projectName ?? '—'}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {t.assigneeName ?? 'Unassigned'}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        'inline-block px-2 py-0.5 rounded-full text-xs',
                        STATUS_STYLES[t.status]
                      )}
                    >
                      {STATUS_LABELS[t.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {t.dueDate ?? '—'}
                  </td>
                  {showActions && (
                    <td className="px-4 py-2 text-right space-x-2 whitespace-nowrap">
                      {canUpdate && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditing(t)}
                        >
                          Edit
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isDeleting}
                          onClick={() => handleDelete(t.id)}
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

function TaskForm({
  orgSlug,
  task,
  projectOptions,
  memberOptions,
  onDone,
}: {
  orgSlug: string
  task: TaskRow | null
  projectOptions: ProjectOption[]
  memberOptions: MemberOption[]
  onDone: () => void
}) {
  const action = task ? updateTask : createTask
  const [state, formAction, pending] = useActionState<TaskFormState, FormData>(action, null)

  useEffect(() => {
    if (state && 'success' in state) onDone()
  }, [state, onDone])

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <h2 className="font-medium">{task ? 'Edit task' : 'New task'}</h2>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="orgSlug" value={orgSlug} />
        {task && <input type="hidden" name="taskId" value={task.id} />}

        {state && 'error' in state && (
          <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
            {state.error}
          </p>
        )}

        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            name="title"
            defaultValue={task?.title ?? ''}
            placeholder="Design the landing page"
            required
            autoFocus
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="projectId">Project</Label>
            <select
              id="projectId"
              name="projectId"
              defaultValue={task?.projectId ?? ''}
              className="w-full border rounded-md px-3 py-2 bg-background text-sm"
            >
              <option value="">— No project —</option>
              {projectOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="assignedTo">Assignee</Label>
            <select
              id="assignedTo"
              name="assignedTo"
              defaultValue={task?.assignedTo ?? ''}
              className="w-full border rounded-md px-3 py-2 bg-background text-sm"
            >
              <option value="">— Unassigned —</option>
              {memberOptions.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              name="status"
              defaultValue={task?.status ?? 'todo'}
              className="w-full border rounded-md px-3 py-2 bg-background text-sm"
            >
              <option value="todo">To do</option>
              <option value="in_progress">In progress</option>
              <option value="done">Done</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="dueDate">Due date</Label>
            <Input
              id="dueDate"
              name="dueDate"
              type="date"
              defaultValue={task?.dueDate ?? ''}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <textarea
            id="description"
            name="description"
            defaultValue={task?.description ?? ''}
            rows={3}
            placeholder="Details of the task…"
            className="w-full border rounded-md px-3 py-2 bg-background text-sm"
          />
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : task ? 'Save changes' : 'Create task'}
          </Button>
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
