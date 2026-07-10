'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  createCheckoutSession,
  createPortalSession,
  type BillingActionResult,
} from './actions'

export type PlanCard = {
  id: string
  name: string
  priceMonthly: number
  features: string[]
  available: boolean
}

export function BillingPlans({
  orgSlug,
  currentPlanId,
  isSubscribed,
  plans,
}: {
  orgSlug: string
  currentPlanId: string
  isSubscribed: boolean
  plans: PlanCard[]
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function go(run: () => Promise<BillingActionResult>) {
    setError(null)
    start(async () => {
      const res = await run()
      if ('error' in res) setError(res.error)
      else window.location.href = res.url
    })
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {plans.map((p) => {
          const isCurrent = p.id === currentPlanId
          return (
            <div
              key={p.id}
              className={cn(
                'border rounded-lg p-4 space-y-3 flex flex-col',
                isCurrent && 'border-foreground ring-1 ring-foreground'
              )}
            >
              <div>
                <h3 className="font-medium">{p.name}</h3>
                <p className="text-2xl font-bold">
                  ${p.priceMonthly}
                  <span className="text-sm font-normal text-muted-foreground">
                    /mo
                  </span>
                </p>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1 flex-1">
                {p.features.map((f) => (
                  <li key={f}>• {f}</li>
                ))}
              </ul>

              {isCurrent ? (
                <div className="text-sm font-medium text-center py-2">
                  Current plan
                </div>
              ) : p.id === 'free' ? (
                <div className="text-sm text-muted-foreground text-center py-2">
                  —
                </div>
              ) : isSubscribed ? (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={pending}
                  onClick={() => go(() => createPortalSession(orgSlug))}
                >
                  Change in portal
                </Button>
              ) : p.available ? (
                <Button
                  className="w-full"
                  disabled={pending}
                  onClick={() => go(() => createCheckoutSession(orgSlug, p.id))}
                >
                  Upgrade to {p.name}
                </Button>
              ) : (
                <Button className="w-full" disabled title="Set the price ID in .env.local">
                  Not configured
                </Button>
              )}
            </div>
          )
        })}
      </div>

      {isSubscribed && (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => go(() => createPortalSession(orgSlug))}
        >
          Manage billing
        </Button>
      )}
    </div>
  )
}
