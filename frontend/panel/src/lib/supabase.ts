import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseCredentials } from './env'

let client: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    const { url, anonKey } = getSupabaseCredentials()
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return client
}

export async function getCurrentSession(): Promise<Session | null> {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase.auth.getSession()
  if (error) {
    console.error('[supabase] session error', error)
    return null
  }
  return data.session ?? null
}
