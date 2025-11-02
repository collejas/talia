import { fetchJSONWithAuth } from '@/lib/api'
import type { VisitasApiResponse } from '@/types/visitas'

export interface VisitasQuery {
  limit: number
  offset: number
  rango?: string
  conChat?: 'with' | 'without' | 'all'
  estado?: string
  search?: string
}

export async function fetchVisitas(query: VisitasQuery) {
  const params = new URLSearchParams()
  params.set('limit', String(query.limit))
  params.set('offset', String(query.offset))

  if (query.rango) params.set('rango', query.rango)
  if (query.conChat === 'with') params.set('con_chat', 'true')
  if (query.conChat === 'without') params.set('con_chat', 'false')
  if (query.estado) params.set('estado', query.estado)
  if (query.search) params.set('q', query.search)

  const { ok, data, status } = await fetchJSONWithAuth<VisitasApiResponse>(
    `/api/visitas/webchat?${params.toString()}`,
  )

  if (!ok || !data) {
    const message =
      typeof data === 'object' && data && 'detail' in data
        ? String((data as { detail?: unknown }).detail)
        : `Error consultando visitas (status ${status})`
    throw new Error(message)
  }

  if (!Array.isArray(data.items)) {
    throw new Error('Respuesta inesperada de visitas webchat')
  }

  return {
    items: data.items,
    total: Number(data.total ?? 0),
    totals: {
      conChat: Number(data.totals?.con_chat ?? 0),
      sinChat: Number(data.totals?.sin_chat ?? 0),
    },
    pagination: {
      limit: Number(data.pagination?.limit ?? query.limit),
      offset: Number(data.pagination?.offset ?? query.offset),
      returned: Number(data.pagination?.returned ?? data.items.length),
    },
  }
}
