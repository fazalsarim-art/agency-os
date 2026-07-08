'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { acceptInvite } from './actions'

export function AcceptButton({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <div className="space-y-2">
      {error && (
        <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
          {error}
        </p>
      )}
      <Button
        className="w-full"
        disabled={pending}
        onClick={() => {
          setError(null)
          start(async () => {
            const res = await acceptInvite(token)
            if (res?.error) setError(res.error)
          })
        }}
      >
        {pending ? 'Joining…' : 'Accept invitation'}
      </Button>
    </div>
  )
}
