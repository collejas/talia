import { buildLoginUrl } from '@/lib/paths'
import { getSupabaseClient } from '@/lib/supabase'

interface FetchJSONResult<T> {
  ok: boolean
  status: number
  data: T | null
}

export async function fetchJSONWithAuth<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<FetchJSONResult<T>> {
  const supabase = getSupabaseClient()
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

  if (sessionError || !sessionData.session) {
    window.location.href = buildLoginUrl()
    return { ok: false, status: 401, data: null }
  }

  const headers = new Headers(init?.headers ?? undefined)
  headers.set('Authorization', `Bearer ${sessionData.session.access_token}`)
  headers.set('cache-control', 'no-cache')

  const response = await fetch(input, {
    ...init,
    headers,
  })

  if (response.status === 401) {
    window.location.href = buildLoginUrl()
    return { ok: false, status: 401, data: null }
  }

  let payload: T | null = null
  try {
    payload = (await response.json()) as T
  } catch (error) {
    console.warn('[api] respuesta sin JSON', error)
    payload = null
  }

  return {
    ok: response.ok,
    status: response.status,
    data: payload,
  }
}
