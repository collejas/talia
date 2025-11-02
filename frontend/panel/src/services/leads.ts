import { fetchJSONWithAuth } from '@/lib/api'
import type {
  LeadItem,
  LeadMetadata,
  LeadStage,
  LeadTablero,
  LeadUser,
  LeadsApiResponse,
  LeadsResult,
  LeadUpdatePayload,
} from '@/types/leads'

export interface LeadsQuery {
  limit: number
  offset: number
  search?: string
  canal?: string
  etapa?: string
  vendedor?: string
}

type RawLeadRow = Record<string, unknown>

function parseMetadata(raw: unknown): LeadMetadata {
  if (!raw) return null
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null
    } catch {
      return null
    }
  }
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  return null
}

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((value) => (typeof value === 'string' ? value.trim() : null))
      .filter((value): value is string => Boolean(value))
  }
  return []
}

function parseUser(raw: unknown): LeadUser | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const id = typeof record.id === 'string' ? record.id : null
  const nombre =
    typeof record.nombre_completo === 'string'
      ? record.nombre_completo
      : typeof record.nombre === 'string'
        ? record.nombre
        : null
  const correo = typeof record.correo === 'string' ? record.correo : null
  if (!id && !nombre && !correo) return null
  return {
    id,
    nombre,
    correo,
  }
}

function parseStage(raw: unknown): LeadStage | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  if (typeof record.id !== 'string') return null
  return {
    id: record.id,
    nombre: typeof record.nombre === 'string' ? record.nombre : record.id,
    categoria: typeof record.categoria === 'string' ? record.categoria : null,
    orden: typeof record.orden === 'number' ? record.orden : null,
  }
}

function parseTablero(raw: unknown): LeadTablero | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const id = typeof record.id === 'string' ? record.id : null
  const nombre = typeof record.nombre === 'string' ? record.nombre : null
  const slug = typeof record.slug === 'string' ? record.slug : null
  if (!id && !nombre && !slug) return null
  return { id, nombre, slug }
}

function normalizeLead(row: RawLeadRow): LeadItem {
  const metadata = parseMetadata(row.metadata)
  const metadataRecord = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : null
  const metadataTags = metadataRecord && Array.isArray(metadataRecord.tags)
    ? metadataRecord.tags
    : undefined
  const tags = parseTags(row.tags ?? metadataTags)

  const contactoRaw = row.contacto as Record<string, unknown> | undefined
  const contactoNombre =
    (contactoRaw?.nombre as string | undefined) ??
    (contactoRaw?.nombre_completo as string | undefined) ??
    (row.contacto_nombre as string | undefined) ??
    'Sin nombre'
  const contactoCorreo =
    (contactoRaw?.correo as string | undefined) ?? (row.contacto_correo as string | undefined) ?? null
  const contactoTelefono =
    (contactoRaw?.telefono as string | undefined) ??
    (contactoRaw?.telefono_e164 as string | undefined) ??
    (row.contacto_telefono as string | undefined) ??
    null

  const contacto = {
    id:
      (contactoRaw?.id as string | undefined) ??
      (row.contacto_id as string | undefined) ??
      null,
    nombre: contactoNombre || 'Sin nombre',
    correo: contactoCorreo || null,
    telefono: contactoTelefono || null,
    estado: typeof contactoRaw?.estado === 'string' ? contactoRaw.estado : null,
    empresa: typeof contactoRaw?.company_name === 'string' ? contactoRaw.company_name : null,
    notasIA: typeof contactoRaw?.notes === 'string' ? contactoRaw.notes : null,
    resumenIA:
      typeof contactoRaw?.necesidad === 'string'
        ? contactoRaw.necesidad
        : typeof contactoRaw?.necesidad_proposito === 'string'
          ? contactoRaw.necesidad_proposito
          : null,
    creado_en:
      typeof contactoRaw?.creado_en === 'string'
        ? contactoRaw.creado_en
        : (row.contacto_creado_en as string | undefined) ?? null,
  }

  const etapa = parseStage(row.etapa)
  const tablero = parseTablero(row.tablero)
  const asignado = parseUser(row.asignado)
  const propietario = parseUser(row.propietario)

  let siguienteAccion: string | null = null
  if (typeof row.siguiente_accion === 'string' && row.siguiente_accion.trim()) {
    siguienteAccion = row.siguiente_accion.trim()
  } else if (
    metadataRecord &&
    typeof metadataRecord.siguiente_accion === 'string'
  ) {
    siguienteAccion = metadataRecord.siguiente_accion
  }

  const probabilidad =
    typeof row.probabilidad === 'number'
      ? row.probabilidad
      : typeof row.probabilidad_override === 'number'
        ? row.probabilidad_override
        : null

  return {
    id: String(row.id ?? ''),
    canal: typeof row.canal === 'string' ? row.canal : null,
    creado_en: typeof row.creado_en === 'string' ? row.creado_en : null,
    actualizado_en: typeof row.actualizado_en === 'string' ? row.actualizado_en : null,
    lead_score: typeof row.lead_score === 'number' ? row.lead_score : null,
    probabilidad,
    siguiente_accion: siguienteAccion ?? null,
    tags,
    metadata,
    contacto,
    etapa,
    tablero,
    asignado,
    propietario,
  }
}

function resolveErrorMessage(data: unknown, status: number, fallback: string) {
  if (data && typeof data === 'object' && 'detail' in data && typeof (data as { detail?: unknown }).detail === 'string') {
    return (data as { detail: string }).detail
  }
  return `${fallback} (status ${status})`
}

export async function fetchLeads(query: LeadsQuery): Promise<LeadsResult> {
  const params = new URLSearchParams()
  params.set('limit', String(query.limit))
  params.set('offset', String(query.offset))

  if (query.search) params.set('q', query.search)
  if (query.canal) params.set('canal', query.canal)
  if (query.etapa) params.set('etapa', query.etapa)
  if (query.vendedor) params.set('asignado', query.vendedor)

  const { ok, data, status } = await fetchJSONWithAuth<LeadsApiResponse>(
    `/api/leads?${params.toString()}`,
  )

  if (!ok || !data) {
    throw new Error(resolveErrorMessage(data, status, 'No se pudo obtener la lista de leads'))
  }

  const rawItems = Array.isArray(data.items) ? (data.items as RawLeadRow[]) : []
  const items = rawItems.map(normalizeLead).filter((item) => item.id)
  const total = typeof data.total === 'number' ? data.total : items.length
  const offset = typeof data.offset === 'number' ? data.offset : query.offset
  const limit = typeof data.limit === 'number' ? data.limit : query.limit
  const hasMore =
    typeof data.has_more === 'boolean'
      ? data.has_more
      : offset + items.length < total

  return {
    items,
    total,
    limit,
    offset,
    hasMore,
  }
}

export async function updateLead(id: string, payload: LeadUpdatePayload) {
  const { ok, data, status } = await fetchJSONWithAuth<Record<string, unknown>>(
    `/api/leads/${id}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  )

  if (!ok) {
    throw new Error(resolveErrorMessage(data, status, 'No se pudo actualizar el lead'))
  }

  return data
}

export async function deleteLead(id: string) {
  const { ok, data, status } = await fetchJSONWithAuth<Record<string, unknown>>(
    `/api/leads/${id}`,
    {
      method: 'DELETE',
    },
  )

  if (!ok) {
    throw new Error(resolveErrorMessage(data, status, 'No se pudo eliminar el lead'))
  }

  return data
}
