import { fetchJSONWithAuth } from '@/lib/api'
import type { VisitasApiResponse } from '@/types/visitas'

export type VisitasRange = 'all' | 'hoy' | 'ayer' | '7d' | '30d'

export interface VisitasQuery {
  limit: number
  offset: number
  rango?: VisitasRange
  conChat?: 'with' | 'without' | 'all'
  estado?: string
  country?: string
  city?: string
  search?: string
  sessionId?: string
  ip?: string
  visitasMin?: number
  visitasMax?: number
  firstFrom?: string
  firstTo?: string
  lastFrom?: string
  lastTo?: string
  stayMin?: number
  stayMax?: number
  avgStayMin?: number
  avgStayMax?: number
  contactStatus?: 'completo' | 'incompleto' | 'sin_contacto'
  deviceTypes?: string[]
  referrer?: string
  landing?: string
  orderBy?: string
  orderDirection?: 'asc' | 'desc'
}

export async function fetchVisitas(query: VisitasQuery) {
  const params = new URLSearchParams()
  params.set('limit', String(query.limit))
  params.set('offset', String(query.offset))

  if (query.rango && query.rango !== 'all') params.set('rango', query.rango)
  if (query.conChat === 'with') params.set('con_chat', 'true')
  if (query.conChat === 'without') params.set('con_chat', 'false')
  if (query.estado) params.set('estado', query.estado)
  if (query.country) params.set('pais', query.country)
  if (query.city) params.set('ciudad', query.city)
  if (query.search) params.set('q', query.search)
  if (query.sessionId) params.set('session', query.sessionId)
  if (query.ip) params.set('ip', query.ip)
  if (typeof query.visitasMin === 'number') params.set('visitas_min', String(query.visitasMin))
  if (typeof query.visitasMax === 'number') params.set('visitas_max', String(query.visitasMax))
  if (query.firstFrom) params.set('primera_desde', query.firstFrom)
  if (query.firstTo) params.set('primera_hasta', query.firstTo)
  if (query.lastFrom) params.set('ultimo_desde', query.lastFrom)
  if (query.lastTo) params.set('ultimo_hasta', query.lastTo)
  if (typeof query.stayMin === 'number') params.set('estancia_min', String(query.stayMin))
  if (typeof query.stayMax === 'number') params.set('estancia_max', String(query.stayMax))
  if (typeof query.avgStayMin === 'number') params.set('estancia_promedio_min', String(query.avgStayMin))
  if (typeof query.avgStayMax === 'number') params.set('estancia_promedio_max', String(query.avgStayMax))
  if (query.contactStatus) params.set('contacto_estado', query.contactStatus)
  if (query.deviceTypes?.length) params.set('dispositivo', query.deviceTypes.join(','))
  if (query.referrer) params.set('referrer', query.referrer)
  if (query.landing) params.set('landing', query.landing)
  if (query.orderBy) params.set('orden', query.orderBy)
  if (query.orderDirection) params.set('direccion', query.orderDirection)

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
