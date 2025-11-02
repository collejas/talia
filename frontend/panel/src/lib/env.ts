const WINDOW_SUPABASE_URL = 'SUPABASE_URL'
const WINDOW_SUPABASE_ANON_KEY = 'SUPABASE_ANON_KEY'

function readWindowEnv(key: string): string | undefined {
  if (typeof window === 'undefined') return undefined
  const globalWindow = window as unknown as Record<string, unknown>
  const value = globalWindow[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

export function getSupabaseCredentials(): { url: string; anonKey: string } {
  const url =
    import.meta.env.VITE_SUPABASE_URL ??
    readWindowEnv(WINDOW_SUPABASE_URL) ??
    ''
  const anonKey =
    import.meta.env.VITE_SUPABASE_ANON_KEY ??
    readWindowEnv(WINDOW_SUPABASE_ANON_KEY) ??
    ''

  if (!url || !anonKey) {
    throw new Error(
      'Supabase no está configurado. Define SUPABASE_URL y SUPABASE_ANON_KEY en env.js o variables VITE_.',
    )
  }

  return { url, anonKey }
}
