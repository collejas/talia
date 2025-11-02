import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'

import { buildLoginUrl } from '@/lib/paths'
import { getSupabaseClient } from '@/lib/supabase'

interface UseSupabaseSessionResult {
  session: Session | null
  loading: boolean
}

export function useSupabaseSession(): UseSupabaseSessionResult {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = getSupabaseClient()

    async function resolveSession() {
      try {
        const { data } = await supabase.auth.getSession()
        if (!data.session) {
          window.location.href = buildLoginUrl()
          return
        }
        setSession(data.session)
      } catch (error) {
        console.error('[auth] error resolving session', error)
        window.location.href = buildLoginUrl()
      } finally {
        setLoading(false)
      }
    }

    resolveSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (!nextSession) {
        window.location.href = buildLoginUrl()
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  return { session, loading }
}
