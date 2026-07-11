'use client'

import { useActionState } from 'react'
import { renameOrganization, type SettingsState } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function SettingsForm({
  orgSlug,
  currentName,
}: {
  orgSlug: string
  currentName: string
}) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(
    renameOrganization,
    null
  )

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div>
        <h2 className="font-medium">Organization name</h2>
        <p className="text-sm text-muted-foreground">
          This is shown across the workspace. The URL doesn’t change.
        </p>
      </div>
      <form action={action} className="space-y-4">
        <input type="hidden" name="orgSlug" value={orgSlug} />

        {state && 'error' in state && (
          <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
            {state.error}
          </p>
        )}
        {state && 'success' in state && (
          <p className="text-sm rounded-md bg-green-100 text-green-800 p-3">
            Saved.
          </p>
        )}

        <div className="space-y-2 max-w-sm">
          <Label htmlFor="name">Name</Label>
          <Input
            key={currentName}
            id="name"
            name="name"
            defaultValue={currentName}
            required
            minLength={2}
            maxLength={120}
          />
        </div>

        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save changes'}
        </Button>
      </form>
    </div>
  )
}
