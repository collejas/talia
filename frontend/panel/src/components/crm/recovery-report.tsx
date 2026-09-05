"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  IconAlertTriangle,
  IconCalendarStats,
  IconRefresh,
  IconSearch,
  IconTargetArrow,
} from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type RecoveryItem = {
  id: string
  codigo_oportunidad: string | null
  titulo: string
  etapa_nombre: string | null
  monto_estimado: number | null
  moneda: string | null
  estado_seguimiento: "activo" | "en_riesgo" | "estancado" | "dormido"
  temperatura: "caliente" | "tibio" | "frio" | null
  estrategia_seguimiento: "seguimiento_normal" | "reactivacion" | "nurturing" | "no_contactar"
  ultima_interaccion_contacto_en: string | null
  proxima_actividad_en: string | null
  dias_sin_interaccion: number | null
  prioridad_reactivacion: number | null
}

type RecoveryResponse = {
  total_abiertas: number
  pipeline_abierto: number
  pipeline_activo: number
  valor_detenido: number
  activas: number
  en_riesgo: number
  estancadas: number
  dormidas: number
  sin_proxima_actividad: number
  cobertura_seguimiento_pct: number
  pipeline_activo_pct: number
  seguimiento_a_tiempo_pct: number
  ausencia_dormidas_pct: number
  efectividad_recuperacion_pct: number
  indice_salud_comercial: number
  items: RecoveryItem[]
  total_items: number
}

type FilterState = {
  estado: string
  temperatura: string
  estrategia: string
  q: string
}

type FollowUpConfig = {
  dias_activo_hasta: number
  dias_en_riesgo_hasta: number
  dias_estancado_hasta: number
  dias_dormido_desde: number
  ventana_reactivacion_dias: number
  ventana_universo_reactivacion_dias: number
  max_intentos_reactivacion: number
}

const EMPTY_FILTERS: FilterState = { estado: "todos", temperatura: "todas", estrategia: "todas", q: "" }

const stateLabels: Record<string, string> = {
  activo: "Activo",
  en_riesgo: "En riesgo",
  estancado: "Estancado",
  dormido: "Dormido",
}

const temperatureLabels: Record<string, string> = {
  caliente: "Caliente",
  tibio: "Tibio",
  frio: "Frío",
}

const strategyLabels: Record<string, string> = {
  seguimiento_normal: "Seguimiento normal",
  reactivacion: "Reactivación",
  nurturing: "Nurturing",
  no_contactar: "No contactar",
}

function formatCurrency(value: number, currency = "MXN") {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency, maximumFractionDigits: 0 }).format(value)
}

function formatDate(value: string | null) {
  if (!value) return "Sin interacción registrada"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Sin interacción registrada" : new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(date)
}

function badgeClass(value: string) {
  if (value === "dormido" || value === "no_contactar") return "border-blue-200 bg-blue-50 text-blue-700"
  if (value === "estancado" || value === "reactivacion") return "border-amber-200 bg-amber-50 text-amber-700"
  if (value === "en_riesgo") return "border-orange-200 bg-orange-50 text-orange-700"
  if (value === "caliente") return "border-red-200 bg-red-50 text-red-700"
  return "border-emerald-200 bg-emerald-50 text-emerald-700"
}

export function RecoveryReport() {
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [data, setData] = useState<RecoveryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [config, setConfig] = useState<FollowUpConfig | null>(null)
  const [configDraft, setConfigDraft] = useState<FollowUpConfig | null>(null)
  const [savingConfig, setSavingConfig] = useState(false)
  const [configError, setConfigError] = useState<string | null>(null)

  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: "500" })
    if (filters.estado !== "todos") params.set("estado_seguimiento", filters.estado)
    if (filters.temperatura !== "todas") params.set("temperatura", filters.temperatura)
    if (filters.estrategia !== "todas") params.set("estrategia_seguimiento", filters.estrategia)
    if (filters.q.trim()) params.set("q", filters.q.trim())
    return params.toString()
  }, [filters])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/crm/pipeline/recovery?${query}`, { cache: "no-store" })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? "No se pudo cargar el informe")
      setData(payload as RecoveryResponse)
    } catch (err) {
      setData(null)
      setError(err instanceof Error ? err.message : "No se pudo cargar el informe")
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    void fetch("/api/crm/pipeline/recovery/configuration", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<FollowUpConfig> : null)
      .then((value) => { if (value) { setConfig(value); setConfigDraft(value) } })
      .catch(() => undefined)
  }, [])

  const saveConfig = async () => {
    if (!configDraft) return
    if (!(configDraft.dias_activo_hasta < configDraft.dias_en_riesgo_hasta && configDraft.dias_en_riesgo_hasta < configDraft.dias_estancado_hasta && configDraft.dias_estancado_hasta < configDraft.dias_dormido_desde)) {
      setConfigError("Los valores deben quedar en orden: Activo < En riesgo < Estancado < Dormido.")
      return
    }
    setConfigError(null)
    setSavingConfig(true)
    try {
      const response = await fetch("/api/crm/pipeline/recovery/configuration", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(configDraft) })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? "No se pudo guardar la configuración")
      setConfig(payload as FollowUpConfig)
      setConfigDraft(payload as FollowUpConfig)
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : "No se pudo guardar la configuración")
    } finally { setSavingConfig(false) }
  }

  const updateFilter = (key: keyof FilterState, value: string) => setFilters((current) => ({ ...current, [key]: value }))

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-4 md:px-6">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-medium text-primary">Informes del CRM</p>
          <h1 className="text-2xl font-semibold tracking-tight">Recuperación de oportunidades</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Identifica qué oportunidades abiertas requieren seguimiento y cuáles están perdiendo ritmo.</p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <IconRefresh className={loading ? "mr-2 size-4 animate-spin" : "mr-2 size-4"} /> Actualizar
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Pipeline abierto" value={data ? formatCurrency(data.pipeline_abierto) : "—"} description={`${data?.total_abiertas ?? 0} oportunidades abiertas`} />
        <KpiCard label="Valor detenido" value={data ? formatCurrency(data.valor_detenido) : "—"} description="En riesgo, estancado o dormido" tone="warning" />
        <KpiCard label="Oportunidades dormidas" value={data ? String(data.dormidas) : "—"} description="Estado actual" tone="info" />
        <KpiCard label="Sin próxima actividad" value={data ? String(data.sin_proxima_actividad) : "—"} description="Requieren definir qué sigue" tone="warning" />
        <KpiCard label="Cobertura de seguimiento" value={data ? `${data.cobertura_seguimiento_pct.toFixed(1)}%` : "—"} description="Con próxima actividad programada" tone="success" />
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Salud comercial</CardTitle>
          <CardDescription>Índice explicable con la información operativa disponible.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-[180px_1fr] lg:items-center">
          <div className="rounded-xl border bg-muted/20 p-5 text-center">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Índice actual</p>
            <p className="mt-2 text-4xl font-semibold text-primary">{data ? data.indice_salud_comercial.toFixed(0) : "—"}<span className="text-lg text-muted-foreground">/100</span></p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <HealthMetric label="Cobertura de seguimiento" value={data?.cobertura_seguimiento_pct} />
            <HealthMetric label="% pipeline activo" value={data?.pipeline_activo_pct} />
            <HealthMetric label="Seguimiento a tiempo" value={data?.seguimiento_a_tiempo_pct} />
            <HealthMetric label="Ausencia de dormidas" value={data?.ausencia_dormidas_pct} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Configuración de seguimiento</CardTitle>
          <CardDescription>Estos umbrales se aplican únicamente a este tenant.</CardDescription>
        </CardHeader>
        <CardContent>
          {configDraft ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{([ ["dias_activo_hasta", "Activo hasta (días)"], ["dias_en_riesgo_hasta", "En riesgo hasta (días)"], ["dias_estancado_hasta", "Estancado hasta (días)"], ["dias_dormido_desde", "Dormido desde (días)"], ["ventana_reactivacion_dias", "Ventana de reactivación"], ["ventana_universo_reactivacion_dias", "Ventana del universo"], ["max_intentos_reactivacion", "Máximo de intentos"] ] as const).map(([key, label]) => <label key={key} className="space-y-1 text-sm"><span className="text-muted-foreground">{label}</span><Input type="number" min={0} value={configDraft[key]} onChange={(event) => setConfigDraft({ ...configDraft, [key]: Number(event.target.value) })} /></label>)}</div> : <p className="text-sm text-muted-foreground">Cargando configuración...</p>}
          {configError ? <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{configError}</div> : null}
          {configDraft ? <div className="mt-4 flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Los rangos deben aumentar: Activo &lt; En riesgo &lt; Estancado &lt; Dormido.</p><Button onClick={() => void saveConfig()} disabled={savingConfig || JSON.stringify(config) === JSON.stringify(configDraft)}>{savingConfig ? "Guardando..." : "Guardar configuración"}</Button></div> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base"><IconTargetArrow className="size-5 text-primary" /> Oportunidades para revisar</CardTitle>
          <CardDescription>Los filtros consultan el estado operativo actual de tu organización.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="relative xl:col-span-2"><IconSearch className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" value={filters.q} onChange={(event) => updateFilter("q", event.target.value)} placeholder="Buscar oportunidad..." /></div>
            <Select value={filters.estado} onValueChange={(value) => updateFilter("estado", value)}><SelectTrigger><SelectValue placeholder="Estado" /></SelectTrigger><SelectContent><SelectItem value="todos">Todos los estados</SelectItem>{Object.entries(stateLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
            <Select value={filters.temperatura} onValueChange={(value) => updateFilter("temperatura", value)}><SelectTrigger><SelectValue placeholder="Temperatura" /></SelectTrigger><SelectContent><SelectItem value="todas">Todas las temperaturas</SelectItem>{Object.entries(temperatureLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
            <Select value={filters.estrategia} onValueChange={(value) => updateFilter("estrategia", value)}><SelectTrigger><SelectValue placeholder="Estrategia" /></SelectTrigger><SelectContent><SelectItem value="todas">Todas las estrategias</SelectItem>{Object.entries(strategyLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
          </div>

          {error ? <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"><IconAlertTriangle className="mt-0.5 size-4 shrink-0" /><span>{error}</span></div> : null}
          {!error && !loading && data && data.items.length === 0 ? <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">No hay oportunidades que coincidan con estos filtros.</div> : null}
          {loading ? <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">Cargando oportunidades...</div> : null}
          {!loading && !error && data && data.items.length > 0 ? <Table><TableHeader><TableRow><TableHead>Oportunidad</TableHead><TableHead>Etapa</TableHead><TableHead>Valor</TableHead><TableHead>Seguimiento</TableHead><TableHead>Temperatura</TableHead><TableHead>Sin interacción</TableHead><TableHead>Próxima actividad</TableHead></TableRow></TableHeader><TableBody>{data.items.map((item) => <TableRow key={item.id}><TableCell><div className="font-medium">{item.titulo}</div><div className="text-xs text-muted-foreground">{item.codigo_oportunidad ?? "Sin código"}</div></TableCell><TableCell>{item.etapa_nombre ?? "Sin etapa"}</TableCell><TableCell>{item.monto_estimado == null ? "—" : formatCurrency(item.monto_estimado, item.moneda ?? "MXN")}</TableCell><TableCell><Badge variant="outline" className={badgeClass(item.estado_seguimiento)}>{stateLabels[item.estado_seguimiento]}</Badge><div className="mt-1 text-xs text-muted-foreground">{strategyLabels[item.estrategia_seguimiento]}</div></TableCell><TableCell>{item.temperatura ? <Badge variant="outline" className={badgeClass(item.temperatura)}>{temperatureLabels[item.temperatura]}</Badge> : <span className="text-xs text-muted-foreground">Sin definir</span>}</TableCell><TableCell>{item.dias_sin_interaccion == null ? <span className="text-xs text-muted-foreground">Sin registro</span> : <div><span className="font-medium">{item.dias_sin_interaccion} días</span><div className="text-xs text-muted-foreground">{formatDate(item.ultima_interaccion_contacto_en)}</div></div>}</TableCell><TableCell>{item.proxima_actividad_en ? formatDate(item.proxima_actividad_en) : <span className="text-xs text-amber-700">Sin programar</span>}</TableCell></TableRow>)}</TableBody></Table> : null}
          {data && data.total_items > data.items.length ? <p className="text-xs text-muted-foreground">Mostrando {data.items.length} de {data.total_items} resultados.</p> : null}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 text-xs text-muted-foreground"><IconCalendarStats className="size-4" /> Esta primera versión refleja el estado actual. Las tendencias históricas y la priorización automática de Tal-IA se habilitarán con el historial de eventos y snapshots.</div>
    </div>
  )
}

function KpiCard({ label, value, description, tone = "default" }: { label: string; value: string; description: string; tone?: "default" | "warning" | "info" | "success" }) {
  const accent = tone === "warning" ? "text-amber-700" : tone === "info" ? "text-blue-700" : tone === "success" ? "text-emerald-700" : "text-foreground"
  return <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">{label}</p><p className={`mt-2 text-2xl font-semibold tracking-tight ${accent}`}>{value}</p><p className="mt-1 text-xs text-muted-foreground">{description}</p></CardContent></Card>
}

function HealthMetric({ label, value }: { label: string; value?: number }) {
  return <div className="rounded-lg border p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{label}</span><span className="text-sm font-semibold">{value == null ? "—" : `${value.toFixed(1)}%`}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, Math.max(0, value ?? 0))}%` }} /></div></div>
}
