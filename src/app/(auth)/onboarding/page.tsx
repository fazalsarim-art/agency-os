import { requireUser } from '@/lib/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function OnboardingPage() {
  await requireUser()

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome to AgencyOS</CardTitle>
          <CardDescription>
            Let&apos;s set up your workspace. Organization creation coming in the next stage.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            You are signed in. Organization onboarding flow will be built in Stage 4.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
