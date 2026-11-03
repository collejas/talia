"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export type Amount = number | string
export type Relation = { id?: string; nombre?: string | null; nombre_completo?: string | null; titulo?: string | null; codigo_oportunidad?: string | null; correo?: string | null; correo_principal?: string | null; telefono_principal_e164?: string | null; curp?: string | null; rfc?: string | null; asignado?: Relation | null }
export type Unit = { unidad?: string | null; nombre?: string | null; clave?: string | null; precio?: number | string | null; desarrollo?: Relation | null; macrolote?: Relation | null; manzana?: Relation | null }
export type Operation = {
  id: string
  estado: string
  estado_validacion?: string | null
  origen_venta?: string | null
  precio_establecido?: number | string | null
  precio_ofrecido?: number | string | null
  precio_acordado?: number | string | null
  precio_final?: number | string | null
  moneda?: string | null
  forma_adquisicion?: string | null
  creado_en?: string | null
  fecha_evento_externo?: string | null
  referencia_externa?: string | null
  comision_porcentaje?: number | string | null
  comision_monto?: number | string | null
  unidad?: Unit | null
  cliente?: Relation | null
  oportunidad?: (Relation & { asignado?: Relation | null }) | null
  agente_usuario?: Relation | null
  responsable_interno?: Relation | null
  socio_comercial?: Relation | null
  agente_externo?: Relation | null
}

type ApiResponse = { items?: Operation[]; total?: number; limit?: number; offset?: number }
export type OperationDocument = { id: string; tipo_documento?: string | null; archivo_id?: string | null; estado_revision?: string | null; observaciones_revision?: string | null; subido_en?: string | null; revisado_en?: string | null }
export type OperationPayment = { id: string; concepto?: string | null; importe?: Amount; moneda?: string | null; fecha_pago?: string | null; forma_pago?: string | null; estado?: string | null; referencia?: string | null; archivo_comprobante_id?: string | null; observaciones?: string | null }
export type OperationContract = { id: string; version_operacion?: number | null; estado?: string | null; archivo_generado_id?: string | null; archivo_firmado_id?: string | null; fecha_firma?: string | null; firmado_en?: string | null; parte_vendedora_nombre?: string | null; parte_vendedora_firmante?: string | null; firmantes?: Relation[] }
export type OperationMovement = { id: string; estado_anterior?: string | null; estado_nuevo?: string | null; precio?: Amount; moneda?: string | null; motivo?: string | null; creado_en?: string | null }
export type OperationQuote = { id: string; folio?: string | null; estatus?: string | null; total?: Amount; moneda?: string | null; dominio_comercial?: string | null; unidad_id?: string | null; creado_en?: string | null; actualizado_en?: string | null }
export type OperationDetail = Operation & { documentos?: OperationDocument[]; contratos?: OperationContract[]; pagos?: OperationPayment[]; movimientos?: OperationMovement[]; cotizaciones?: OperationQuote[]; cambios_comprador?: unknown[] }

export const statusLabels: Record<string, string> = {
  reservada: "Reservada",
  apartada: "Apartada",
  vendida: "Vendida",
  cancelada: "Cancelada",
}

export const validationLabels: Record<string, string> = {
  pendiente_captura: "Pendiente de captura",
  pendiente_revision: "Pendiente de validación",
  en_revision: "En revisión",
  firme: "Firme",
  rechazada: "Rechazada",
}

export const statusClasses: Record<string, string> = {
  reservada: "font-semibold text-orange-700",
  apartada: "font-semibold text-amber-700",
  vendida: "font-semibold text-emerald-700",
  cancelada: "font-semibold text-slate-500 line-through",
}

export const validationClasses: Record<string, string> = {
  pendiente_captura: "text-amber-700",
  pendiente_revision: "text-amber-700",
  en_revision: "text-blue-700",
  firme: "text-emerald-700",
  rechazada: "text-rose-700",
}

export function relationName(value?: Relation | null) {
  return value?.nombre_completo || value?.nombre || value?.titulo || "—"
}

export function money(value: number | string | null | undefined, currency = "MXN") {
  const amount = Number(value ?? 0)
  if (!Number.isFinite(amount)) return "—"
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: currency.trim() || "MXN", maximumFractionDigits: 2 }).format(amount)
}

export function date(value?: string | null) {
  if (!value) return "—"
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(parsed)
}

export function hierarchy(unit?: Unit | null) {
  if (!unit) return "Unidad no disponible"
  return [relationName(unit.desarrollo), relationName(unit.macrolote), relationName(unit.manzana), unit.unidad || unit.nombre || unit.clave].filter((value) => value && value !== "—").join(" · ")
}

export function agentName(item: Operation) {
  if (item.origen_venta === "externo") return relationName(item.agente_externo)
  return relationName(item.agente_usuario) !== "—"
    ? relationName(item.agente_usuario)
    : relationName(item.responsable_interno) !== "—"
      ? relationName(item.responsable_interno)
      : relationName(item.oportunidad?.asignado)
}

export function fileHref(fileId?: string | null, download = false) {
  if (!fileId) return null
  return `/api/crm/inmobiliaria/operaciones/documentos/archivo/${encodeURIComponent(fileId)}${download ? "?descargar=true" : ""}`
}

export function documentLabel(type?: string | null) {
  const labels: Record<string, string> = {
    acta_nacimiento: "Acta de nacimiento",
    acta_matrimonio: "Acta de matrimonio",
    ine: "Identificación oficial",
    constancia_situacion_fiscal: "Constancia de situación fiscal",
    curp: "CURP",
    comprobante_domicilio: "Comprobante de domicilio",
  }
  return (type && labels[type]) || type || "Documento"
}

export function detailDate(value?: string | null) {
  if (!value) return "—"
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? "—" : new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(parsed)
}

export function InmobiliariaSalesView() {
  const router = useRouter()
  const [items, setItems] = useState<Operation[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [estado, setEstado] = useState("")
  const [origen, setOrigen] = useState("")
  const [search, setSearch] = useState("")

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ limit: "200", offset: "0" })
    if (estado) params.set("estado", estado)
    if (origen) params.set("origen_venta", origen)
    fetch(`/api/crm/inmobiliaria/ventas?${params.toString()}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as ApiResponse & { error?: string } | null
        if (!response.ok) throw new Error(payload?.error || "No se pudieron cargar las ventas inmobiliarias.")
        return payload || {}
      })
      .then((payload) => {
        if (controller.signal.aborted) return
        setItems(Array.isArray(payload.items) ? payload.items : [])
        setTotal(Number(payload.total || 0))
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "No se pudieron cargar las ventas inmobiliarias.")
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [estado, origen])

  const filteredItems = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("es-MX")
    if (!normalized) return items
    return items.filter((item) => [
      hierarchy(item.unidad), relationName(item.cliente), relationName(item.oportunidad), item.oportunidad?.codigo_oportunidad,
      relationName(item.socio_comercial), relationName(item.agente_externo), item.referencia_externa,
    ].filter(Boolean).join(" ").toLocaleLowerCase("es-MX").includes(normalized))
  }, [items, search])

  const visibleAmount = filteredItems.reduce((sum, item) => sum + Number(item.precio_final ?? item.precio_acordado ?? item.precio_establecido ?? 0), 0)
  const firmCount = filteredItems.filter((item) => item.estado_validacion === "firme" || item.estado === "vendida").length

  const openOperationDetail = (operationId: string) => {
    router.push(`/ventas-inmobiliarias/${encodeURIComponent(operationId)}`)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ventas inmobiliarias</h1>
        <p className="mt-1 text-sm text-muted-foreground">Consulta operaciones inmobiliarias, su avance documental y la atribución comercial.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardDescription>Operaciones</CardDescription><CardTitle>{total.toLocaleString("es-MX")}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Registros que cumplen los filtros</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Valor visible</CardDescription><CardTitle>{money(visibleAmount)}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Precio establecido o acordado</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Firmes o vendidas</CardDescription><CardTitle>{firmCount.toLocaleString("es-MX")}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Dentro de los registros cargados</CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Operaciones</CardTitle>
          <CardDescription>Las reservas y apartados no representan ingresos cerrados hasta completar la validación financiera.</CardDescription>
          <div className="grid gap-3 pt-3 md:grid-cols-[minmax(0,1fr)_180px_180px]">
            <Input placeholder="Buscar comprador, oportunidad, unidad, socio o agente" value={search} onChange={(event) => setSearch(event.target.value)} />
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={estado} onChange={(event) => { setLoading(true); setError(null); setEstado(event.target.value) }}><option value="">Todos los estados</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={origen} onChange={(event) => { setLoading(true); setError(null); setOrigen(event.target.value) }}><option value="">Origen: todos</option><option value="interno">Interna</option><option value="externo">Externa</option></select>
          </div>
        </CardHeader>
        <CardContent>
          {loading && <p className="py-8 text-center text-sm text-muted-foreground">Cargando operaciones inmobiliarias...</p>}
          {error && <p className="py-8 text-center text-sm text-destructive">{error}</p>}
          {!loading && !error && filteredItems.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No hay operaciones para los filtros seleccionados.</p>}
          {!loading && !error && filteredItems.length > 0 && (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader><TableRow><TableHead>Unidad</TableHead><TableHead>Comprador / oportunidad</TableHead><TableHead>Estado</TableHead><TableHead>Origen / agente</TableHead><TableHead>Valor</TableHead><TableHead>Fecha</TableHead></TableRow></TableHeader>
                <TableBody>{filteredItems.map((item) => <TableRow key={item.id} className="cursor-pointer" tabIndex={0} onClick={() => void openOperationDetail(item.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void openOperationDetail(item.id) } }}>
                  <TableCell className="min-w-[260px] font-medium">{hierarchy(item.unidad)}</TableCell>
                  <TableCell className="min-w-[220px]"><div>{relationName(item.cliente)}</div><div className="text-xs text-muted-foreground">{relationName(item.oportunidad)}{item.oportunidad?.codigo_oportunidad ? ` · ${item.oportunidad.codigo_oportunidad}` : ""}</div></TableCell>
                  <TableCell className="min-w-[150px]"><div className={statusClasses[item.estado] || "font-semibold text-foreground"}>{statusLabels[item.estado] || item.estado}</div><div className={`text-xs ${validationClasses[item.estado_validacion || ""] || "text-muted-foreground"}`}>{item.estado_validacion ? validationLabels[item.estado_validacion] || item.estado_validacion : "Sin validación"}</div></TableCell>
                  <TableCell className="min-w-[210px]"><div>{item.origen_venta === "externo" ? "Externa" : "Interna"}</div><div className="text-xs text-muted-foreground">{item.origen_venta === "externo" ? `${relationName(item.socio_comercial)} · ${agentName(item)}` : agentName(item) === "—" ? "Asesor no asignado" : agentName(item)}</div></TableCell>
                  <TableCell className="whitespace-nowrap">{money(item.precio_final ?? item.precio_acordado ?? item.precio_establecido, item.moneda || "MXN")}</TableCell>
                  <TableCell className="whitespace-nowrap"><div>{date(item.fecha_evento_externo || item.creado_en)}</div><Button type="button" variant="link" size="sm" className="h-auto px-0 text-xs" onClick={(event) => { event.stopPropagation(); void openOperationDetail(item.id) }}>Ver expediente</Button></TableCell>
                </TableRow>)}</TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  )
}
