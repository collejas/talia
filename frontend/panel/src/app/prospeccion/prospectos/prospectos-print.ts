import type { ProspectoItem, ProspectosTableColumnPreference } from "@/lib/prospeccion/prospectos-client"

export type ProspectosPrintColumn = { id: ProspectosTableColumnPreference; label: string }
export type ProspectosExportColumn = { key: string; label: string; value: (item: ProspectoItem) => unknown }
export type ProspectosPrintFilters = { chips: string[]; total: number; envioFallback?: string }

const FUENTE_LABELS: Record<string, string> = { google_places: "Google Places", denue: "DENUE", usuario: "Usuario" }
type ExtendedProspecto = ProspectoItem & {
  query_sort?: string | null; telefono_principal_tipo_linea?: string | null; telefono_principal_extension?: string | null
  telefono_movil_1_tipo_linea?: string | null; cvegeo?: string | null; lat?: number | null; lng?: number | null
  google_primary_type?: string | null; google_primary_type_display_name?: string | null; google_types?: string[] | null
  envios_correo_total?: number | null; envios_whatsapp_total?: number | null; envios_voz_total?: number | null; envios_total?: number | null
}

function display(value: unknown): string | number {
  if (value === null || value === undefined || value === "") return "—"
  if (typeof value === "boolean") return value ? "Sí" : "No"
  if (Array.isArray(value)) return value.join(" · ") || "—"
  if (typeof value === "object") return JSON.stringify(value)
  return value as string | number
}
function formatDate(value: string | null | undefined) {
  if (!value) return "—"
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(parsed)
}
function formatJson(value: unknown) {
  if (value === null || value === undefined) return "—"
  try { return JSON.stringify(value) } catch { return String(value) }
}
function metadataString(item: ProspectoItem, keys: string[]) {
  for (const key of keys) {
    const value = item.metadata?.[key]
    if (typeof value === "string" || typeof value === "number") return value
  }
  return null
}
function campaignName(item: ProspectoItem) { return metadataString(item, ["campana_nombre", "campaign_name", "campana", "campaign"]) }

/** Excel conserva todos los campos explícitos que devuelve el listado, sin depender de columnas visibles. */
const EXPORT_DEFINITIONS: Array<[string, string, (item: ProspectoItem) => unknown]> = [
  ["display_name", "Nombre mostrado", (i) => i.display_name], ["name", "Nombre original", (i) => i.name], ["razon_social", "Razón social", (i) => i.razon_social], ["nombre_comercial", "Nombre comercial", (i) => i.nombre_comercial],
  ["titulo", "Título", (i) => i.titulo], ["nombre", "Nombre de contacto", (i) => i.nombre], ["primer_apellido", "Primer apellido", (i) => i.primer_apellido], ["segundo_apellido", "Segundo apellido", (i) => i.segundo_apellido],
  ["actividad", "Actividad", (i) => i.actividad], ["segmento", "Segmento", (i) => i.segmento], ["stage", "Etapa", (i) => i.stage], ["estrato", "Tamaño / estrato", (i) => i.estrato], ["rating", "Rating", (i) => i.rating],
  ["fuente", "Fuente", (i) => FUENTE_LABELS[i.fuente] ?? i.fuente], ["query_sort", "Consulta", (i) => (i as ExtendedProspecto).query_sort],
  ["phone", "Teléfono original", (i) => i.phone], ["telefono_movil_1_e164", "Teléfono móvil E.164", (i) => i.telefono_movil_1_e164], ["carrier_type", "Tipo de operador", (i) => i.carrier_type], ["lookup_status", "Estado de validación telefónica", (i) => i.lookup_status],
  ["correo_principal", "Correo principal", (i) => i.correo_principal ?? i.email], ["email_lookup_status", "Estado de validación de correo", (i) => i.email_lookup_status], ["email_lookup_checked_en", "Correo validado el", (i) => formatDate(i.email_lookup_checked_en)], ["email_quality_tier", "Calidad del correo", (i) => i.email_quality_tier], ["email_risk_score", "Riesgo del correo", (i) => i.email_risk_score], ["email_recommendation", "Recomendación de correo", (i) => i.email_recommendation], ["email_domain_relation", "Relación correo-sitio", (i) => i.email_domain_relation],
  ["website", "Sitio web", (i) => i.website], ["website_lookup_status", "Estado de validación del sitio", (i) => i.website_lookup_status], ["website_lookup_checked_en", "Sitio validado el", (i) => formatDate(i.website_lookup_checked_en)], ["website_final_url", "URL final del sitio", (i) => i.website_final_url],
  ["address", "Dirección", (i) => i.address], ["address_full", "Dirección completa", (i) => i.address_full], ["tipo_vialidad", "Tipo de vialidad", (i) => i.tipo_vialidad], ["nombre_vialidad", "Nombre de vialidad", (i) => i.nombre_vialidad], ["numero_exterior", "Número exterior", (i) => i.numero_exterior], ["numero_interior", "Número interior", (i) => i.numero_interior], ["colonia", "Colonia", (i) => i.colonia], ["codigo_postal", "Código postal", (i) => i.codigo_postal], ["asentamiento", "Asentamiento", (i) => i.asentamiento], ["entre_calles", "Entre calles", (i) => i.entre_calles], ["referencia", "Referencia de ubicación", (i) => i.referencia], ["localidad", "Localidad", (i) => i.localidad], ["localidad_cve", "Clave de localidad", (i) => i.localidad_cve], ["municipio_nombre", "Municipio", (i) => i.municipio_nombre ?? i.municipality_name], ["municipio_cve", "Clave de municipio", (i) => i.municipio_cve], ["estado_nombre", "Estado", (i) => i.estado_nombre ?? i.state_name], ["estado_cve", "Clave de estado", (i) => i.estado_cve], ["pais_nombre", "País", (i) => i.pais_nombre ?? i.country_name], ["cvegeo", "Clave geoestadística", (i) => (i as ExtendedProspecto).cvegeo], ["lat", "Latitud", (i) => (i as ExtendedProspecto).lat], ["lng", "Longitud", (i) => (i as ExtendedProspecto).lng],
  ["google_primary_type", "Tipo Google", (i) => (i as ExtendedProspecto).google_primary_type], ["google_primary_type_display_name", "Tipo Google mostrado", (i) => (i as ExtendedProspecto).google_primary_type_display_name], ["google_types", "Tipos Google", (i) => formatJson((i as ExtendedProspecto).google_types)], ["whatsapp_permitido", "WhatsApp permitido", (i) => i.whatsapp_permitido], ["llamada_permitida", "Llamada permitida", (i) => i.llamada_permitida],
  ["envios_correo_total", "Envíos de correo", (i) => (i as ExtendedProspecto).envios_correo_total], ["envios_whatsapp_total", "Envíos de WhatsApp", (i) => (i as ExtendedProspecto).envios_whatsapp_total], ["envios_voz_total", "Envíos de llamada", (i) => (i as ExtendedProspecto).envios_voz_total], ["envios_total", "Envíos totales", (i) => (i as ExtendedProspecto).envios_total], ["campana", "Campaña", campaignName], ["scraper_ejecutado", "Scraper ejecutado", (i) => i.scraper_ejecutado], ["scraper_ultimo_en", "Último scraper", (i) => formatDate(i.scraper_ultimo_en)], ["scraper_ultimo_estado", "Estado del scraper", (i) => i.scraper_ultimo_estado], ["creado_en", "Creado el", (i) => formatDate(i.creado_en)], ["actualizado_en", "Actualizado el", (i) => formatDate(i.actualizado_en)],
]
export const PROSPECTOS_EXPORT_COLUMNS: ProspectosExportColumn[] = EXPORT_DEFINITIONS.map(([key, label, value]) => ({ key, label, value }))

function pdfValue(item: ProspectoItem, column: ProspectosTableColumnPreference, envioFallback?: string) {
  switch (column) {
    case "prospecto": return item.display_name || item.nombre_comercial || item.nombre || "—"
    case "correo": return item.correo_principal || item.email || "—"
    case "sitio_web": return item.website || "—"
    case "sitio_verificado": return item.website_lookup_status || "—"
    case "telefono": return item.telefono_principal_e164 || item.phone_e164 || item.phone || "—"
    case "tipo_linea": return item.telefono_principal_tipo_linea || item.carrier_type || "—"
    case "telefono_verificado": return item.lookup_status || "—"
    case "fuente": return FUENTE_LABELS[item.fuente] ?? item.fuente ?? "—"
    case "actividad": return item.actividad || "—"
    case "segmento": return item.segmento || "—"
    case "tamano_rating": return [item.estrato, item.rating !== null && item.rating !== undefined ? `Rating ${item.rating}` : ""].filter(Boolean).join(" · ") || "—"
    case "campana": return campaignName(item) || "—"
    case "con_envio": return item.contact_indicators ? ((item.contact_indicators.total_envios ?? 0) > 0 ? "Sí" : "No") : (envioFallback || "—")
    case "creado": return formatDate(item.creado_en)
    default: return "—"
  }
}

export const PROSPECTOS_PDF_COLUMNS: ProspectosPrintColumn[] = [
  { id: "prospecto", label: "Nombre mostrado" }, { id: "correo", label: "Correo principal" }, { id: "telefono", label: "Teléfono principal" }, { id: "sitio_web", label: "Sitio web" }, { id: "fuente", label: "Fuente" }, { id: "actividad", label: "Actividad" }, { id: "tamano_rating", label: "Tamaño / rating" }, { id: "campana", label: "Campaña" }, { id: "creado", label: "Creado el" },
]

function escapeHtml(value: unknown) {
  const replacements: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }
  return String(value ?? "—").replace(/[&<>"']/g, (character) => replacements[character] ?? character)
}

export function printProspectos(items: ProspectoItem[], columns: ProspectosPrintColumn[], filters: ProspectosPrintFilters, targetWindow: Window) {
  const filterSummary = filters.chips.length ? filters.chips.join(" · ") : "Sin filtros adicionales"
  const rows = items.map((item) => `<tr>${columns.map((column) => `<td>${escapeHtml(pdfValue(item, column.id, filters.envioFallback))}</td>`).join("")}</tr>`).join("")
  const headers = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")
  const title = `Prospectos · ${filters.total.toLocaleString("es-MX")} registros`
  targetWindow.opener = null
  targetWindow.document.open()
  targetWindow.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{color:#172033;font:9px/1.35 Arial,sans-serif;margin:0}header{align-items:center;border-bottom:3px solid #14b8a6;display:flex;justify-content:space-between;margin-bottom:9px;padding-bottom:8px}h1{color:#0f172a;font-size:18px;margin:0 0 2px}p{color:#475569;font-size:8px;margin:3px 0}.summary{color:#0f172a;font-size:9px;font-weight:700;text-align:right}.table-heading{align-items:end;display:flex;justify-content:space-between;margin:0 0 8px}.table-heading h2{color:#0f172a;font-size:13px;margin:0}table{border-collapse:collapse;table-layout:fixed;width:100%}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}th{background:#0f172a;color:white;font-size:7px;text-align:left;text-transform:uppercase}th,td{border:1px solid #d8dee8;overflow-wrap:anywhere;padding:5px;vertical-align:top}td{font-size:7.5px}tbody tr:nth-child(even){background:#f6f8fb}.empty{text-align:center;padding:16px}footer{border-top:1px solid #d8dee8;color:#64748b;font-size:7px;margin-top:6px;padding-top:4px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><header><div><h1>Prospección · Prospectos</h1><p>${escapeHtml(filterSummary)}</p></div><div class="summary">${filters.total.toLocaleString("es-MX")} registros</div></header><div class="table-heading"><h2>Listado de prospectos</h2><p>Generado ${escapeHtml(new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date()))}</p></div><table><thead><tr>${headers}</tr></thead><tbody>${rows || `<tr><td class="empty" colspan="${Math.max(columns.length, 1)}">No hay prospectos que coincidan con los filtros.</td></tr>`}</tbody></table><footer>Reporte filtrado desde Tal-IA</footer></body></html>`)
  targetWindow.document.close(); targetWindow.focus(); targetWindow.print()
}

export function prospectoValueForExport(item: ProspectoItem, column: ProspectosTableColumnPreference) { return pdfValue(item, column) }
export function prospectoExportRow(item: ProspectoItem) { return Object.fromEntries(PROSPECTOS_EXPORT_COLUMNS.map((column) => [column.label, display(column.value(item))])) }
