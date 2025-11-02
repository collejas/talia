import type { ComponentType } from 'react'
import type { Session } from '@supabase/supabase-js'

import { Skeleton } from '@/components/ui/skeleton'
import { useSupabaseSession } from '@/hooks/useSupabaseSession'

export function ProtectedRoute({
  component: Component,
}: {
  component: ComponentType<{ session: Session }>
}) {
  const { loading, session } = useSupabaseSession()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="flex w-full max-w-sm flex-col gap-4 p-6">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    )
  }

  if (!session) {
    return null
  }

  return <Component session={session} />
}
