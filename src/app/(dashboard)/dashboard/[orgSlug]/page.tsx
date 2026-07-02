export default async function DashboardPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params

  return (
    <div className="flex min-h-screen flex-col p-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-muted-foreground">Organization: {orgSlug}</p>
    </div>
  )
}
