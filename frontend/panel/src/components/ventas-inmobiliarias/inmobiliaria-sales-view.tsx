"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

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
  total_cobrado?: number | string | null
  saldo_pendiente?: number | string | null
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

type ReportBucket = { estado?: string; origen?: string; nombre?: string; operaciones?: number; valor?: number | string }
type ReportData = {
  resumen?: { operaciones?: number; operaciones_activas?: number; pendientes_validacion?: number; operaciones_firmes?: number; valor_operaciones?: number | string; total_cobrado?: number | string; total_cobrado_periodo?: number | string; saldo_pendiente?: number | string; ticket_promedio?: number | string }
  serie?: Array<{ mes: string; valor?: number | string; cobrado?: number | string }>
  por_estado?: ReportBucket[]
  por_origen?: ReportBucket[]
  por_desarrollo?: ReportBucket[]
  items?: Operation[]
}
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

function dateInputValue(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
}

function periodLabel(value: string) {
  const [year, month] = value.split("-").map(Number)
  return new Intl.DateTimeFormat("es-MX", { month: "short", year: "2-digit" }).format(new Date(year, (month || 1) - 1, 1))
}

export function InmobiliariaSalesView() {
  const router = useRouter()
  const [items, setItems] = useState<Operation[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [estado, setEstado] = useState("")
  const [estadoValidacion, setEstadoValidacion] = useState("")
  const [origen, setOrigen] = useState("")
  const [search, setSearch] = useState("")
  const [periodo, setPeriodo] = useState("mes")
  const [desde, setDesde] = useState(() => dateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))
  const [hasta, setHasta] = useState(() => dateInputValue(new Date()))
  const [report, setReport] = useState<ReportData>({})

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ desde, hasta })
    if (estado) params.set("estado", estado)
    if (estadoValidacion) params.set("estado_validacion", estadoValidacion)
    if (origen) params.set("origen_venta", origen)
    fetch(`/api/crm/inmobiliaria/ventas/reporte?${params.toString()}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as ReportData & { error?: string } | null
        if (!response.ok) throw new Error(payload?.error || "No se pudieron cargar las ventas inmobiliarias.")
        return payload || {}
      })
      .then((payload) => {
        if (controller.signal.aborted) return
        setReport(payload)
        setItems(Array.isArray(payload.items) ? payload.items : [])
        setTotal(Number(payload.resumen?.operaciones || 0))
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "No se pudieron cargar las ventas inmobiliarias.")
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [desde, hasta, estado, estadoValidacion, origen])

  const filteredItems = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("es-MX")
    if (!normalized) return items
    return items.filter((item) => [
      hierarchy(item.unidad), relationName(item.cliente), relationName(item.oportunidad), item.oportunidad?.codigo_oportunidad,
      relationName(item.socio_comercial), relationName(item.agente_externo), agentName(item), item.referencia_externa,
    ].filter(Boolean).join(" ").toLocaleLowerCase("es-MX").includes(normalized))
  }, [items, search])

  const summary = report.resumen || {}
  const chartData = (report.serie || []).map((point) => ({ ...point, label: periodLabel(point.mes), valor: Number(point.valor || 0), cobrado: Number(point.cobrado || 0) }))
  const statusChartData = (report.por_estado || []).map((item) => ({ ...item, label: statusLabels[item.estado || ""] || item.estado || "Sin estado", operaciones: Number(item.operaciones || 0), valor: Number(item.valor || 0) }))
  const originLabels: Record<string, string> = { interno: "Equipo interno", externo: "Agentes externos" }

  const selectPeriod = (value: string) => {
    const now = new Date()
    const from = value === "90d" ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89) : value === "ano" ? new Date(now.getFullYear(), 0, 1) : new Date(now.getFullYear(), now.getMonth(), 1)
    setPeriodo(value)
    if (value !== "personalizado") { setDesde(dateInputValue(from)); setHasta(dateInputValue(now)) }
  }

  const openOperationDetail = (operationId: string) => {
    router.push(`/ventas-inmobiliarias/${encodeURIComponent(operationId)}`)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ventas inmobiliarias</h1>
        <p className="mt-1 text-sm text-muted-foreground">Consulta operaciones inmobiliarias, su avance documental y la atribución comercial.</p>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle>Filtros del reporte</CardTitle><CardDescription>El periodo afecta los KPIs, gráficas y listado de operaciones.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="grid gap-1.5"><label htmlFor="property-sales-period" className="text-sm font-medium">Periodo</label><select id="property-sales-period" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={periodo} onChange={(event) => selectPeriod(event.target.value)}><option value="mes">Mes actual</option><option value="90d">Últimos 90 días</option><option value="ano">Año actual</option><option value="personalizado">Personalizado</option></select></div>
          <div className="grid gap-1.5"><label htmlFor="property-sales-from" className="text-sm font-medium">Desde</label><Input id="property-sales-from" type="date" value={desde} onChange={(event) => { setPeriodo("personalizado"); setDesde(event.target.value) }} /></div>
          <div className="grid gap-1.5"><label htmlFor="property-sales-to" className="text-sm font-medium">Hasta</label><Input id="property-sales-to" type="date" value={hasta} onChange={(event) => { setPeriodo("personalizado"); setHasta(event.target.value) }} /></div>
          <div className="grid gap-1.5"><label htmlFor="property-sales-status" className="text-sm font-medium">Estado comercial</label><select id="property-sales-status" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={estado} onChange={(event) => setEstado(event.target.value)}><option value="">Todos</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
          <div className="grid gap-1.5"><label htmlFor="property-sales-validation" className="text-sm font-medium">Validación</label><select id="property-sales-validation" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={estadoValidacion} onChange={(event) => setEstadoValidacion(event.target.value)}><option value="">Todas</option>{Object.entries(validationLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
          <div className="grid gap-1.5"><label htmlFor="property-sales-origin" className="text-sm font-medium">Origen</label><select id="property-sales-origin" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={origen} onChange={(event) => setOrigen(event.target.value)}><option value="">Todos</option><option value="interno">Equipo interno</option><option value="externo">Agentes externos</option></select></div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardDescription>Operaciones</CardDescription><CardTitle>{Number(summary.operaciones || total).toLocaleString("es-MX")}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Dentro del periodo y filtros</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Operaciones activas</CardDescription><CardTitle>{Number(summary.operaciones_activas || 0).toLocaleString("es-MX")}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Reservadas o apartadas</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Ventas firmes</CardDescription><CardTitle>{Number(summary.operaciones_firmes || 0).toLocaleString("es-MX")}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Validación firme o cierre histórico</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Pendientes de validación</CardDescription><CardTitle>{Number(summary.pendientes_validacion || 0).toLocaleString("es-MX")}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Captura, revisión o autorización</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Valor de operaciones</CardDescription><CardTitle>{money(summary.valor_operaciones || 0)}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Excluye operaciones canceladas</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Cobrado</CardDescription><CardTitle>{money(summary.total_cobrado || 0)}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Pagos confirmados de estas operaciones</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Cobrado en periodo</CardDescription><CardTitle>{money(summary.total_cobrado_periodo || 0)}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Por fecha de pago confirmado</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Saldo pendiente</CardDescription><CardTitle>{money(summary.saldo_pendiente || 0)}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Valor menos pagos confirmados</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Ticket promedio</CardDescription><CardTitle>{money(summary.ticket_promedio || 0)}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Valor promedio por operación no cancelada</CardContent></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Valor y cobranza por mes</CardTitle><CardDescription>Valor de operaciones contra pagos confirmados.</CardDescription></CardHeader><CardContent className="h-72">{chartData.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis tickFormatter={(value: number) => new Intl.NumberFormat("es-MX", { notation: "compact", maximumFractionDigits: 1 }).format(value)} tickLine={false} axisLine={false} /><Tooltip formatter={(value) => money(value as number)} /><Legend /><Bar dataKey="valor" name="Valor" fill="var(--chart-1)" radius={[4, 4, 0, 0]} /><Bar dataKey="cobrado" name="Cobrado" fill="var(--chart-2)" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{loading ? "Cargando reporte…" : "No hay datos en este periodo."}</div>}</CardContent></Card>
        <Card><CardHeader><CardTitle>Operaciones por estado</CardTitle><CardDescription>Las operaciones apartadas no equivalen a ventas firmes.</CardDescription></CardHeader><CardContent className="h-72">{statusChartData.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={statusChartData} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} /><Tooltip /><Legend /><Bar dataKey="operaciones" name="Operaciones" fill="var(--chart-3)" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sin distribución disponible.</div>}</CardContent></Card>
      </div>

      <Card><CardHeader><CardTitle>Distribución comercial</CardTitle><CardDescription>Valor por origen y desarrollo.</CardDescription></CardHeader><CardContent className="grid gap-6 md:grid-cols-2"><div><h3 className="mb-2 text-sm font-semibold">Origen</h3><div className="space-y-2">{(report.por_origen || []).map((item) => <div key={item.origen} className="flex justify-between border-b pb-2 text-sm"><span>{originLabels[item.origen || ""] || item.origen || "—"} · {item.operaciones || 0} operaciones</span><span className="font-medium">{money(item.valor || 0)}</span></div>)}{!report.por_origen?.length ? <p className="text-sm text-muted-foreground">Sin datos.</p> : null}</div></div><div><h3 className="mb-2 text-sm font-semibold">Desarrollo</h3><div className="space-y-2">{(report.por_desarrollo || []).map((item) => <div key={item.nombre} className="flex justify-between border-b pb-2 text-sm"><span>{item.nombre} · {item.operaciones || 0} operaciones</span><span className="font-medium">{money(item.valor || 0)}</span></div>)}{!report.por_desarrollo?.length ? <p className="text-sm text-muted-foreground">Sin datos.</p> : null}</div></div></CardContent></Card>

      <Card>
        <CardHeader>
          <CardTitle>Operaciones</CardTitle>
          <CardDescription>Las reservas y apartados no representan ingresos cerrados hasta completar la validación financiera.</CardDescription>
          <div className="grid gap-3 pt-3">
            <Input placeholder="Buscar comprador, oportunidad, unidad, socio o agente" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          {loading && <p className="py-8 text-center text-sm text-muted-foreground">Cargando operaciones inmobiliarias...</p>}
          {error && <p className="py-8 text-center text-sm text-destructive">{error}</p>}
          {!loading && !error && filteredItems.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No hay operaciones para los filtros seleccionados.</p>}
          {!loading && !error && filteredItems.length > 0 && (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader><TableRow><TableHead>Unidad</TableHead><TableHead>Comprador / oportunidad</TableHead><TableHead>Estado</TableHead><TableHead>Origen / agente</TableHead><TableHead>Valor</TableHead><TableHead>Cobrado</TableHead><TableHead>Saldo</TableHead><TableHead>Fecha</TableHead></TableRow></TableHeader>
                <TableBody>{filteredItems.map((item) => <TableRow key={item.id} className="cursor-pointer" tabIndex={0} onClick={() => void openOperationDetail(item.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void openOperationDetail(item.id) } }}>
                  <TableCell className="min-w-[260px] font-medium">{hierarchy(item.unidad)}</TableCell>
                  <TableCell className="min-w-[220px]"><div>{relationName(item.cliente)}</div><div className="text-xs text-muted-foreground">{relationName(item.oportunidad)}{item.oportunidad?.codigo_oportunidad ? ` · ${item.oportunidad.codigo_oportunidad}` : ""}</div></TableCell>
                  <TableCell className="min-w-[150px]"><div className={statusClasses[item.estado] || "font-semibold text-foreground"}>{statusLabels[item.estado] || item.estado}</div><div className={`text-xs ${validationClasses[item.estado_validacion || ""] || "text-muted-foreground"}`}>{item.estado_validacion ? validationLabels[item.estado_validacion] || item.estado_validacion : "Sin validación"}</div></TableCell>
                  <TableCell className="min-w-[210px]"><div>{item.origen_venta === "externo" ? "Externa" : "Interna"}</div><div className="text-xs text-muted-foreground">{item.origen_venta === "externo" ? `${relationName(item.socio_comercial)} · ${agentName(item)}` : agentName(item) === "—" ? "Asesor no asignado" : agentName(item)}</div></TableCell>
                  <TableCell className="whitespace-nowrap">{money(item.precio_final ?? item.precio_acordado ?? item.precio_establecido, item.moneda || "MXN")}</TableCell>
                  <TableCell className="whitespace-nowrap">{money(item.total_cobrado, item.moneda || "MXN")}</TableCell>
                  <TableCell className="whitespace-nowrap">{money(item.saldo_pendiente, item.moneda || "MXN")}</TableCell>
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
