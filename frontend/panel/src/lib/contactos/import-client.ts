export type ContactImportItem = {
  display_name?: string
  nombre?: string
  apellido_paterno?: string
  apellido_materno?: string
  correo_principal?: string
  telefono_principal_e164?: string
  company_name?: string
  puesto?: string
  area?: string
  rol_decision?: string
  estado?: string
  origen?: string
  notas?: string
  website?: string
  tipo_vialidad?: string
  nombre_vialidad?: string
  numero_exterior?: string
  numero_interior?: string
  colonia?: string
  codigo_postal?: string
  entidad?: string
  municipio?: string
  pais?: string
}

export type ContactImportSummary = {
  ok: boolean
  total: number
  created: number
  skipped: number
  failed: number
  created_items?: Array<{ id: string }>
  skipped_items?: Array<{ row: number; motivo: string }>
  errors?: Array<{ row: number; motivo: string }>
}

export async function importarContactos(items: ContactImportItem[]): Promise<ContactImportSummary> {
  const response = await fetch("/api/personas/importar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  })
  const body = (await response.json().catch(() => ({}))) as Partial<ContactImportSummary> & { error?: string }
  if (!response.ok) {
    throw new Error(body.error || `No se pudo importar contactos (HTTP ${response.status}).`)
  }
  return body as ContactImportSummary
}
