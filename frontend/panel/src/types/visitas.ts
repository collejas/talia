export interface VisitaRow {
  session_id: string
  ip: string | null
  total_visitas?: number | null
  visit_count?: number | null
  registrado_en?: string | null
  primera_visita_en?: string | null
  ultimo_evento_en?: string | null
  closed_at?: string | null
  stay_seconds?: number | null
  avg_stay_seconds?: number | null
  tuvo_chat?: boolean | null
  mensajes_entrantes?: number | null
  mensajes_salientes?: number | null
  primer_mensaje_en?: string | null
  ultimo_mensaje_conversacion?: string | null
  contacto_id?: string | null
  contacto_nombre?: string | null
  contacto_correo?: string | null
  contacto_telefono?: string | null
  contacto_empresa?: string | null
  contacto_estado?: string | null
  contacto_captura?: string | null
  contacto_creado_en?: string | null
  country_code?: string | null
  country_name?: string | null
  state_name?: string | null
  state_code?: string | null
  city_name?: string | null
  cve_ent?: string | null
  nom_ent?: string | null
  cve_mun?: string | null
  nom_mun?: string | null
  cvegeo?: string | null
  ubicacion_cache?: unknown
  device_type?: string | null
  dispositivo_cache?: Record<string, unknown> | null
  pantalla_cache?: Record<string, unknown> | null
  sistema_operativo?: string | null
  idioma?: string | null
  timezone?: string | null
  prefiere_modo_oscuro?: boolean | null
  referrer?: string | null
  landing_url?: string | null
  trazabilidad_cache?: Record<string, unknown> | null
  geo?: Record<string, unknown> | null
}

export interface VisitasApiResponse {
  ok: boolean
  items: VisitaRow[]
  total: number
  totals?: {
    con_chat?: number
    sin_chat?: number
  }
  pagination?: {
    limit: number
    offset: number
    returned: number
  }
  filters?: Record<string, unknown>
}
