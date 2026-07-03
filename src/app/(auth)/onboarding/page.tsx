'use client'

import { useActionState } from 'react'
import { createOrganization } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export default function OnboardingPage() {
  const [state, action, isPending] = useActionState(createOrganization, null)

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create your workspace</CardTitle>
          <CardDescription>
            Give your organization a name. You can rename it later.
          </CardDescription>
        </CardHeader>
        <form action={action}>
          <CardContent className="space-y-4">
            {state?.error && (
              <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                {state.error}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">Organization name</Label>
              <Input
                id="name"
                name="name"
                type="text"
                placeholder="Acme Agency"
                required
                minLength={2}
                autoFocus
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? 'Creating workspace…' : 'Create workspace'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
