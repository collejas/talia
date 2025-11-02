export interface LeadContact {
  id: string | null
  nombre: string
  correo: string | null
  telefono: string | null
  estado?: string | null
  empresa?: string | null
  notasIA?: string | null
  resumenIA?: string | null
  creado_en?: string | null
}

export interface LeadStage {
  id: string | null
  nombre: string | null
  categoria?: string | null
  orden?: number | null
}

export interface LeadTablero {
  id: string | null
  nombre: string | null
  slug?: string | null
}

export interface LeadUser {
  id: string | null
  nombre?: string | null
  correo?: string | null
}

export type LeadMetadata = Record<string, unknown> | null

export interface LeadItem {
  id: string
  canal?: string | null
  creado_en?: string | null
  actualizado_en?: string | null
  lead_score?: number | null
  probabilidad?: number | null
  siguiente_accion?: string | null
  tags?: string[]
  metadata: LeadMetadata
  contacto: LeadContact
  etapa?: LeadStage | null
  tablero?: LeadTablero | null
  asignado?: LeadUser | null
  propietario?: LeadUser | null
}

export interface LeadsApiResponse {
  ok: boolean
  items: unknown[]
  total: number
  limit?: number
  offset?: number
  has_more?: boolean
}

export interface LeadsResult {
  items: LeadItem[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

export interface LeadUpdateContact {
  nombre?: string | null
  correo?: string | null
  telefono?: string | null
}

export interface LeadUpdatePayload {
  etapa_id: string
  asignado_a_usuario_id?: string | null
  propietario_usuario_id?: string | null
  lead_score?: number | null
  probabilidad_override?: number | null
  siguiente_accion?: string | null
  tags?: string[]
  metadata?: Record<string, unknown> | null
  contacto?: LeadUpdateContact
}
