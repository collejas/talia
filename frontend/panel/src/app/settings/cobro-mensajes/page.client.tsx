"use client"

import * as React from "react"
import {
  IconAlertTriangle,
  IconChartBar,
  IconCoin,
  IconMessageCircle,
  IconRefresh,
  IconSend,
  IconSettings,
  type Icon,
} from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type Period = {
  id: string
  organizacion_id: string
  fecha_inicio: string
  fecha_fin: string
  estado: string
  mensajes_cantidad: number
  mensajes_entrantes_cantidad: number
  mensajes_salientes_cantidad: number
  hilos_con_actividad_cantidad: number
  conversiones_cantidad: number
  subtotal_mensajes: number | string
  costo_meta_periodo: number | string
  costo_mensaje_periodo: number | string
  total: number | string
  moneda: string
}

type Summary = {
  scope: "tenant" | "master"
  organizacion_id: string | null
  periodos: Period[]
  mensajes_cantidad: number
  mensajes_entrantes_cantidad: number
  mensajes_salientes_cantidad: number
  hilos_con_actividad_cantidad: number
  conversiones_cantidad: number
  cargo_app_total: number | string
  costo_meta_total: number | string
  total_consumo: number | string
}

type BillingMessage = {
  id: string
  organizacion_id: string
  conversacion_id: string
  proveedor: string
  canal: string
  direccion: "entrante" | "saliente"
  origen_mensaje: string
  categoria_meta: string
  estado_proveedor: string
  cargo_app_importe: number | string
  costo_meta_importe: number | string
  costo_total_mensaje: number | string
  creado_en: string
}

type MessageResponse = { total: number; page: number; page_size: number; items: BillingMessage[] }
type Reconciliation = { scope: "tenant" | "master"; pendiente: number; vinculado: number; no_conciliado: number }
type UnreconciledEvent = { id: string; organizacion_id: string | null; evento: string; proveedor_mensaje_id: string | null; conciliacion_motivo: string | null; creado_en: string }
type UnreconciledResponse = { items: UnreconciledEvent[] }
type BillingConfiguration = { limite_mensajes_periodo: number | null; limite_costo_app_periodo: number | string | null; limite_costo_meta_periodo: number | string | null; porcentaje_alerta_consumo: number; suspension_automatica_por_limite: boolean }
type BillingAlert = { id: string; organizacion_id: string; tipo: string; severidad: "info" | "warning" | "critical"; estado: string; umbral: number | string | null; valor_actual: number | string | null; mensaje: string; creado_en: string }
type BillingAdjustment = { id: string; organizacion_id: string; periodo_id: string; tipo: "credito" | "cargo" | "reversa"; importe: number | string; moneda: string; motivo: string; referencia: string | null; creado_en: string }
type Rate = { precio_mensaje?: number | string; precio_unitario?: number | string; moneda?: string; alcance?: string; categoria_meta?: string }
type TenantOption = { id: string; nombre: string | null; nombre_comercial: string | null; activo: boolean }
type PeriodPreset = "hoy" | "ayer" | "semana_actual" | "semana_pasada" | "mes_actual" | "bimestre" | "trimestre" | "semestre" | "ano_actual" | "ano_anterior" | "manual"
type DateRange = { desde: string; hasta: string } | null

const periodLabels: Record<PeriodPreset, string> = {
  hoy: "Hoy",
  ayer: "Ayer",
  semana_actual: "Semana actual",
  semana_pasada: "Semana pasada",
  mes_actual: "Mes actual",
  bimestre: "Bimestre",
  trimestre: "Trimestre",
  semestre: "Semestre",
  ano_actual: "Año actual",
  ano_anterior: "Año anterior",
  manual: "Rango manual",
}

function localDateValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function localDateStart(value: string): Date {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(year, month - 1, day)
}

function isoStart(value: string): string {
  return localDateStart(value).toISOString()
}

function periodRange(preset: PeriodPreset, manualDesde: string, manualHasta: string, now = new Date()): DateRange {
  if (preset === "manual") {
    if (!manualDesde || !manualHasta || manualDesde > manualHasta) return null
    const end = localDateStart(manualHasta)
    end.setDate(end.getDate() + 1)
    return { desde: isoStart(manualDesde), hasta: end.toISOString() }
  }

  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(start)
  if (preset === "hoy") end.setDate(end.getDate() + 1)
  if (preset === "ayer") {
    start.setDate(start.getDate() - 1)
  }
  if (preset === "semana_actual" || preset === "semana_pasada") {
    const mondayOffset = (start.getDay() + 6) % 7
    start.setDate(start.getDate() - mondayOffset + (preset === "semana_pasada" ? -7 : 0))
    end.setTime(start.getTime())
    end.setDate(end.getDate() + 7)
  }
  if (preset === "mes_actual") {
    start.setDate(1)
    end.setMonth(end.getMonth() + 1, 1)
  }
  if (preset === "bimestre") {
    start.setMonth(Math.floor(start.getMonth() / 2) * 2, 1)
    end.setTime(start.getTime())
    end.setMonth(end.getMonth() + 2)
  }
  if (preset === "trimestre") {
    start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1)
    end.setTime(start.getTime())
    end.setMonth(end.getMonth() + 3)
  }
  if (preset === "semestre") {
    start.setMonth(start.getMonth() < 6 ? 0 : 6, 1)
    end.setTime(start.getTime())
    end.setMonth(end.getMonth() + 6)
  }
  if (preset === "ano_actual") {
    start.setMonth(0, 1)
    end.setFullYear(end.getFullYear() + 1, 0, 1)
  }
  if (preset === "ano_anterior") {
    start.setFullYear(start.getFullYear() - 1, 0, 1)
    end.setTime(start.getTime())
    end.setFullYear(end.getFullYear() + 1)
  }
  return { desde: start.toISOString(), hasta: end.toISOString() }
}

function amount(value: number | string | null | undefined): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function money(value: number | string | null | undefined): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 4 }).format(amount(value))
}

function integer(value: number | string | null | undefined): string {
  return new Intl.NumberFormat("es-MX").format(amount(value))
}

function errorText(response: Response, fallback: string): Promise<string> {
  return response.json().then((body) => body?.error || body?.detail || fallback).catch(() => fallback)
}

function KpiCard({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: Icon }) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 pt-6">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <div className="rounded-lg bg-primary/10 p-2 text-primary"><Icon size={20} /></div>
      </CardContent>
    </Card>
  )
}

export function MessageBillingPageClient({ isOwner }: { isOwner: boolean }) {
  const [summary, setSummary] = React.useState<Summary | null>(null)
  const [messages, setMessages] = React.useState<MessageResponse | null>(null)
  const [reconciliation, setReconciliation] = React.useState<Reconciliation | null>(null)
  const [unreconciledEvents, setUnreconciledEvents] = React.useState<UnreconciledEvent[]>([])
  const [rate, setRate] = React.useState<Rate | null>(null)
  const [period, setPeriod] = React.useState<PeriodPreset>("mes_actual")
  const [manualDesde, setManualDesde] = React.useState("")
  const [manualHasta, setManualHasta] = React.useState("")
  const [category, setCategory] = React.useState("all")
  const [direction, setDirection] = React.useState("all")
  const [selectedTenant, setSelectedTenant] = React.useState("all")
  const [tenantOptions, setTenantOptions] = React.useState<TenantOption[]>([])
  const [tenantsLoading, setTenantsLoading] = React.useState(false)
  const [page, setPage] = React.useState(1)
  const [loading, setLoading] = React.useState(true)
  const [messageLoading, setMessageLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [refreshToken, setRefreshToken] = React.useState(0)
  const [appPrice, setAppPrice] = React.useState("0.09")
  const [providerPrice, setProviderPrice] = React.useState("0.5614")
  const [tenantOverride, setTenantOverride] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [saveMessage, setSaveMessage] = React.useState<string | null>(null)
  const [billingConfiguration, setBillingConfiguration] = React.useState<BillingConfiguration | null>(null)
  const [limitMessages, setLimitMessages] = React.useState("")
  const [limitAppCost, setLimitAppCost] = React.useState("")
  const [limitMetaCost, setLimitMetaCost] = React.useState("")
  const [alertPercentage, setAlertPercentage] = React.useState("80")
  const [automaticSuspension, setAutomaticSuspension] = React.useState(false)
  const [configurationSaving, setConfigurationSaving] = React.useState(false)
  const [configurationMessage, setConfigurationMessage] = React.useState<string | null>(null)
  const [billingAlerts, setBillingAlerts] = React.useState<BillingAlert[]>([])
  const [alertUpdating, setAlertUpdating] = React.useState<string | null>(null)
  const [billingAdjustments, setBillingAdjustments] = React.useState<BillingAdjustment[]>([])
  const [adjustmentPeriodId, setAdjustmentPeriodId] = React.useState("")
  const [adjustmentType, setAdjustmentType] = React.useState<BillingAdjustment["tipo"]>("credito")
  const [adjustmentAmount, setAdjustmentAmount] = React.useState("")
  const [adjustmentReason, setAdjustmentReason] = React.useState("")
  const [adjustmentSaving, setAdjustmentSaving] = React.useState(false)
  const [adjustmentMessage, setAdjustmentMessage] = React.useState<string | null>(null)
  const [closingPeriodId, setClosingPeriodId] = React.useState<string | null>(null)

  const range = React.useMemo(() => periodRange(period, manualDesde, manualHasta), [manualDesde, manualHasta, period])
  const manualRangeInvalid = period === "manual" && !range
  const scopePrefix = isOwner ? "/master" : ""
  const summaryParams = new URLSearchParams()
  if (isOwner && selectedTenant !== "all") summaryParams.set("organizacion_id", selectedTenant)
  if (range) {
    summaryParams.set("desde", range.desde)
    summaryParams.set("hasta", range.hasta)
  }
  if (category !== "all") summaryParams.set("categoria_meta", category)
  if (direction !== "all") summaryParams.set("direccion", direction)
  const summaryQuery = summaryParams.toString()
  const summaryUrl = `/api/billing${scopePrefix}/summary${summaryQuery ? `?${summaryQuery}` : ""}`
  const messagesUrl = `/api/billing${scopePrefix}/messages`
  const reconciliationParams = new URLSearchParams()
  if (isOwner && selectedTenant !== "all") reconciliationParams.set("organizacion_id", selectedTenant)
  if (range) { reconciliationParams.set("desde", range.desde); reconciliationParams.set("hasta", range.hasta) }
  const reconciliationUrl = `/api/billing${scopePrefix}/reconciliation${reconciliationParams.toString() ? `?${reconciliationParams}` : ""}`
  const unreconciledEventsUrl = `/api/billing${scopePrefix}/reconciliation/events${reconciliationParams.toString() ? `?${reconciliationParams}` : ""}`
  const alertsUrl = `/api/billing${scopePrefix}/alerts${isOwner && selectedTenant !== "all" ? `?organizacion_id=${encodeURIComponent(selectedTenant)}` : ""}`
  const adjustmentsUrl = `/api/billing${scopePrefix}/adjustments${isOwner && selectedTenant !== "all" ? `?organizacion_id=${encodeURIComponent(selectedTenant)}` : ""}`

  React.useEffect(() => {
    if (!isOwner) {
      setTenantOptions([])
      setSelectedTenant("all")
      return
    }
    const controller = new AbortController()
    setTenantsLoading(true)
    fetch("/api/billing/master/tenants", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await errorText(response, "No se pudieron cargar los tenants."))
        return response.json() as Promise<{ items?: TenantOption[] }>
      })
      .then((data) => setTenantOptions(Array.isArray(data.items) ? data.items : []))
      .catch((fetchError) => {
        if ((fetchError as Error).name !== "AbortError") setError(fetchError instanceof Error ? fetchError.message : "No se pudieron cargar los tenants.")
      })
      .finally(() => setTenantsLoading(false))
    return () => controller.abort()
  }, [isOwner, refreshToken])

  React.useEffect(() => {
    if (!isOwner || selectedTenant === "all") {
      setBillingConfiguration(null)
      setConfigurationMessage(null)
      return
    }
    const controller = new AbortController()
    fetch(`/api/billing/master/configuration?organizacion_id=${encodeURIComponent(selectedTenant)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await errorText(response, "No se pudo cargar la configuración de límites."))
        return response.json() as Promise<BillingConfiguration | null>
      })
      .then((data) => {
        setBillingConfiguration(data)
        setLimitMessages(data?.limite_mensajes_periodo == null ? "" : String(data.limite_mensajes_periodo))
        setLimitAppCost(data?.limite_costo_app_periodo == null ? "" : String(data.limite_costo_app_periodo))
        setLimitMetaCost(data?.limite_costo_meta_periodo == null ? "" : String(data.limite_costo_meta_periodo))
        setAlertPercentage(String(data?.porcentaje_alerta_consumo ?? 80))
        setAutomaticSuspension(Boolean(data?.suspension_automatica_por_limite))
      })
      .catch((fetchError) => { if ((fetchError as Error).name !== "AbortError") setConfigurationMessage(fetchError instanceof Error ? fetchError.message : "No se pudo cargar la configuración.") })
    return () => controller.abort()
  }, [isOwner, selectedTenant, refreshToken])

  React.useEffect(() => {
    if (!isOwner) return
    const controller = new AbortController()
    fetch(adjustmentsUrl, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { if (!response.ok) throw new Error(await errorText(response, "No se pudieron consultar los ajustes.")); return response.json() as Promise<{ items?: BillingAdjustment[] }> })
      .then((data) => setBillingAdjustments(data.items ?? []))
      .catch((fetchError) => { if ((fetchError as Error).name !== "AbortError") setAdjustmentMessage(fetchError instanceof Error ? fetchError.message : "No se pudieron consultar los ajustes.") })
    return () => controller.abort()
  }, [adjustmentsUrl, isOwner, refreshToken])

  React.useEffect(() => {
    if (manualRangeInvalid) {
      setLoading(false)
      setSummary(null)
      return
    }
    const controller = new AbortController()
    setLoading(true)
    Promise.all([
      fetch(summaryUrl, { cache: "no-store", signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error(await errorText(response, "No se pudo consultar el resumen."))
        return response.json() as Promise<Summary>
      }),
      fetch(reconciliationUrl, { cache: "no-store", signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error(await errorText(response, "No se pudo consultar la conciliación."))
        return response.json() as Promise<Reconciliation>
      }),
      fetch(unreconciledEventsUrl, { cache: "no-store", signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error(await errorText(response, "No se pudo consultar el detalle de conciliación."))
        return response.json() as Promise<UnreconciledResponse>
      }),
      fetch(alertsUrl, { cache: "no-store", signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error(await errorText(response, "No se pudieron consultar las alertas."))
        return response.json() as Promise<{ items?: BillingAlert[] }>
      }),
      isOwner ? Promise.resolve(null) : fetch("/api/billing/tariff/effective", { cache: "no-store", signal: controller.signal }).then((response) => response.ok ? response.json() : null),
    ]).then(([summaryData, reconciliationData, unreconciledData, alertData, rateData]) => {
      setSummary(summaryData)
      setReconciliation(reconciliationData)
      setUnreconciledEvents(unreconciledData.items ?? [])
      setBillingAlerts(alertData.items ?? [])
      setRate(rateData?.tarifa ?? null)
      setError(null)
    }).catch((fetchError) => {
      if ((fetchError as Error).name !== "AbortError") setError(fetchError instanceof Error ? fetchError.message : "No se pudo cargar billing.")
    }).finally(() => setLoading(false))
    return () => controller.abort()
  }, [alertsUrl, isOwner, manualRangeInvalid, reconciliationUrl, refreshToken, summaryUrl, unreconciledEventsUrl])

  React.useEffect(() => {
    if (manualRangeInvalid) {
      setMessageLoading(false)
      setMessages(null)
      return
    }
    const controller = new AbortController()
    setMessageLoading(true)
    const params = new URLSearchParams({ page: String(page), page_size: "25" })
    if (isOwner && selectedTenant !== "all") params.set("organizacion_id", selectedTenant)
    if (range) {
      params.set("desde", range.desde)
      params.set("hasta", range.hasta)
    }
    if (category !== "all") params.set("categoria_meta", category)
    if (direction !== "all") params.set("direccion", direction)
    fetch(`${messagesUrl}?${params.toString()}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await errorText(response, "No se pudo cargar el detalle."))
        return response.json() as Promise<MessageResponse>
      })
      .then(setMessages)
      .catch((fetchError) => { if ((fetchError as Error).name !== "AbortError") setError(fetchError instanceof Error ? fetchError.message : "No se pudo cargar el detalle.") })
      .finally(() => setMessageLoading(false))
    return () => controller.abort()
  }, [category, direction, isOwner, manualRangeInvalid, messagesUrl, page, range?.desde, range?.hasta, refreshToken, selectedTenant])

  const saveRate = async (kind: "app" | "provider") => {
    setSaving(true); setSaveMessage(null)
    try {
      const isApp = kind === "app"
      const body = isApp
        ? { alcance: tenantOverride.trim() ? "tenant" : "global", organizacion_id: tenantOverride.trim() || null, precio_mensaje: Number(appPrice), motivo: "Configuración desde panel" }
        : { proveedor: "meta", canal: "whatsapp", pais_codigo_iso2: "MX", categoria_meta: "unknown", iniciador_hilo: "empresa", precio_unitario: Number(providerPrice), motivo: "Actualización de tarifa publicada por Meta" }
      const response = await fetch(`/api/billing/master/tariff/${isApp ? "app" : "provider"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      if (!response.ok) throw new Error(await errorText(response, "No se pudo guardar la tarifa."))
      setSaveMessage("Tarifa guardada. Los mensajes históricos conservan su precio aplicado.")
      setRefreshToken((value) => value + 1)
    } catch (saveError) {
      setSaveMessage(saveError instanceof Error ? saveError.message : "No se pudo guardar la tarifa.")
    } finally { setSaving(false) }
  }

  const saveConfiguration = async () => {
    if (!isOwner || selectedTenant === "all") return
    setConfigurationSaving(true); setConfigurationMessage(null)
    try {
      const response = await fetch(`/api/billing/master/configuration?organizacion_id=${encodeURIComponent(selectedTenant)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          limite_mensajes_periodo: limitMessages.trim() ? Number(limitMessages) : null,
          limite_costo_app_periodo: limitAppCost.trim() ? Number(limitAppCost) : null,
          limite_costo_meta_periodo: limitMetaCost.trim() ? Number(limitMetaCost) : null,
          porcentaje_alerta_consumo: Number(alertPercentage),
          suspension_automatica_por_limite: automaticSuspension,
        }),
      })
      if (!response.ok) throw new Error(await errorText(response, "No se pudo guardar la configuración."))
      setBillingConfiguration(await response.json() as BillingConfiguration)
      setConfigurationMessage("Configuración guardada. La suspensión automática solo se aplicará si está habilitada explícitamente.")
    } catch (saveError) {
      setConfigurationMessage(saveError instanceof Error ? saveError.message : "No se pudo guardar la configuración.")
    } finally { setConfigurationSaving(false) }
  }

  const updateAlertStatus = async (id: string, estado: "acknowledged" | "resuelta" | "descartada") => {
    setAlertUpdating(id)
    try {
      const response = await fetch("/api/billing/master/alerts/status", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, estado }) })
      if (!response.ok) throw new Error(await errorText(response, "No se pudo actualizar la alerta."))
      const updated = await response.json() as BillingAlert
      setBillingAlerts((items) => items.map((item) => item.id === id ? updated : item))
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "No se pudo actualizar la alerta.")
    } finally { setAlertUpdating(null) }
  }

  const saveAdjustment = async () => {
    if (!isOwner || selectedTenant === "all" || !adjustmentPeriodId) return
    setAdjustmentSaving(true); setAdjustmentMessage(null)
    try {
      const response = await fetch("/api/billing/master/adjustments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizacion_id: selectedTenant, periodo_id: adjustmentPeriodId, tipo: adjustmentType, importe: Number(adjustmentAmount), motivo: adjustmentReason.trim() }) })
      if (!response.ok) throw new Error(await errorText(response, "No se pudo registrar el ajuste."))
      const created = await response.json() as BillingAdjustment
      setBillingAdjustments((items) => [created, ...items]); setAdjustmentAmount(""); setAdjustmentReason(""); setAdjustmentMessage("Ajuste registrado. Los cargos originales no fueron modificados.")
    } catch (saveError) { setAdjustmentMessage(saveError instanceof Error ? saveError.message : "No se pudo registrar el ajuste.") } finally { setAdjustmentSaving(false) }
  }

  const closePeriod = async (periodId: string) => {
    setClosingPeriodId(periodId); setError(null)
    try {
      const response = await fetch(`/api/billing/master/periods/${periodId}/close`, { method: "POST" })
      if (!response.ok) throw new Error(await errorText(response, "El periodo no se puede cerrar."))
      setRefreshToken((value) => value + 1)
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : "El periodo no se puede cerrar.")
    } finally { setClosingPeriodId(null) }
  }

  const totalPages = Math.max(1, Math.ceil((messages?.total ?? 0) / (messages?.page_size ?? 25)))
  const s = summary

  return (
    <div className="flex flex-col gap-6 px-4 py-2 lg:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">{isOwner ? "Tenant maestro" : "Consumo del tenant"}</p>
          <h1 className="text-3xl font-semibold tracking-tight">Cobro de mensajes</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">Cada mensaje entrante o saliente genera el cargo GEOACTIV. El hilo agrupa la actividad; el costo Meta se muestra por separado.</p>
        </div>
        <Button variant="outline" onClick={() => setRefreshToken((value) => value + 1)} disabled={loading || messageLoading}><IconRefresh size={16} /> Actualizar</Button>
      </header>

      {error ? <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><IconAlertTriangle size={17} />{error}</div> : null}

      {isOwner ? <Card><CardHeader><CardTitle>Configuración de tarifas</CardTitle><CardDescription>Solo el owner puede crear nuevas versiones. Los históricos no se recalculan.</CardDescription></CardHeader><CardContent className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border p-4"><p className="font-medium">Cargo GEOACTIV</p><div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="app-price">Precio por mensaje (MXN)</Label><Input id="app-price" type="number" min="0" step="0.0001" value={appPrice} onChange={(event) => setAppPrice(event.target.value)} /></div><div><Label htmlFor="tenant-override">Tenant particular (opcional)</Label><Input id="tenant-override" placeholder="UUID del tenant" value={tenantOverride} onChange={(event) => setTenantOverride(event.target.value)} /></div></div><Button onClick={() => void saveRate("app")} disabled={saving}>{saving ? "Guardando..." : "Guardar tarifa GEOACTIV"}</Button></div>
        <div className="space-y-3 rounded-lg border p-4"><p className="font-medium">Costo publicado Meta</p><div><Label htmlFor="provider-price">Precio Meta por mensaje (MXN)</Label><Input id="provider-price" type="number" min="0" step="0.0001" value={providerPrice} onChange={(event) => setProviderPrice(event.target.value)} /></div><Button variant="outline" onClick={() => void saveRate("provider")} disabled={saving}>{saving ? "Guardando..." : "Guardar tarifa Meta"}</Button></div>
        {saveMessage ? <p className="text-sm text-muted-foreground lg:col-span-2">{saveMessage}</p> : null}
      </CardContent></Card> : null}

      {isOwner && selectedTenant !== "all" ? <Card><CardHeader className="px-3 py-2"><CardTitle className="text-sm">Límites y alertas del tenant</CardTitle><CardDescription className="text-xs">Los campos vacíos no aplican límite. Selecciona un tenant específico para configurar esta sección.</CardDescription></CardHeader><CardContent className="grid gap-3 px-3 pb-3 pt-0 md:grid-cols-4"><div><Label className="text-xs" htmlFor="billing-limit-messages">Mensajes por periodo</Label><Input id="billing-limit-messages" type="number" min="0" step="1" value={limitMessages} onChange={(event) => setLimitMessages(event.target.value)} /></div><div><Label className="text-xs" htmlFor="billing-limit-app">Límite cargo GEOACTIV</Label><Input id="billing-limit-app" type="number" min="0" step="0.0001" value={limitAppCost} onChange={(event) => setLimitAppCost(event.target.value)} /></div><div><Label className="text-xs" htmlFor="billing-limit-meta">Límite costo Meta</Label><Input id="billing-limit-meta" type="number" min="0" step="0.0001" value={limitMetaCost} onChange={(event) => setLimitMetaCost(event.target.value)} /></div><div><Label className="text-xs" htmlFor="billing-alert-percent">Alertar al (%)</Label><Input id="billing-alert-percent" type="number" min="1" max="100" step="1" value={alertPercentage} onChange={(event) => setAlertPercentage(event.target.value)} /></div><label className="flex items-center gap-2 text-xs md:col-span-2"><input type="checkbox" checked={automaticSuspension} onChange={(event) => setAutomaticSuspension(event.target.checked)} />Suspensión automática al alcanzar un límite</label><div className="flex items-end gap-2 md:col-span-2"><Button onClick={() => void saveConfiguration()} disabled={configurationSaving}>{configurationSaving ? "Guardando..." : "Guardar límites"}</Button>{billingConfiguration ? <span className="text-xs text-muted-foreground">Actualizado correctamente</span> : null}</div>{configurationMessage ? <p className="text-xs text-muted-foreground md:col-span-4">{configurationMessage}</p> : null}</CardContent></Card> : null}

      {isOwner && selectedTenant !== "all" ? <Card><CardHeader className="px-3 py-2"><CardTitle className="text-sm">Ajustes manuales</CardTitle><CardDescription className="text-xs">Créditos, cargos o reversas auditables. No modifican el cargo original.</CardDescription></CardHeader><CardContent className="grid gap-3 px-3 pb-3 pt-0 md:grid-cols-5"><div><Label className="text-xs" htmlFor="billing-adjustment-period">Periodo</Label><Select value={adjustmentPeriodId} onValueChange={setAdjustmentPeriodId}><SelectTrigger id="billing-adjustment-period" className="h-8"><SelectValue placeholder="Selecciona periodo" /></SelectTrigger><SelectContent>{(s?.periodos ?? []).filter((item) => item.organizacion_id === selectedTenant).map((item) => <SelectItem key={item.id} value={item.id}>{new Date(item.fecha_inicio).toLocaleDateString("es-MX")} · {item.estado}</SelectItem>)}</SelectContent></Select></div><div><Label className="text-xs" htmlFor="billing-adjustment-type">Tipo</Label><Select value={adjustmentType} onValueChange={(value) => setAdjustmentType(value as BillingAdjustment["tipo"])}><SelectTrigger id="billing-adjustment-type" className="h-8"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="credito">Crédito</SelectItem><SelectItem value="cargo">Cargo</SelectItem><SelectItem value="reversa">Reversa</SelectItem></SelectContent></Select></div><div><Label className="text-xs" htmlFor="billing-adjustment-amount">Importe MXN</Label><Input id="billing-adjustment-amount" type="number" step="0.0001" value={adjustmentAmount} onChange={(event) => setAdjustmentAmount(event.target.value)} /></div><div className="md:col-span-2"><Label className="text-xs" htmlFor="billing-adjustment-reason">Motivo obligatorio</Label><div className="flex gap-2"><Input id="billing-adjustment-reason" value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value)} /><Button onClick={() => void saveAdjustment()} disabled={adjustmentSaving || !adjustmentPeriodId || !adjustmentAmount || !adjustmentReason.trim()}>{adjustmentSaving ? "Guardando..." : "Registrar"}</Button></div></div>{adjustmentMessage ? <p className="text-xs text-muted-foreground md:col-span-5">{adjustmentMessage}</p> : null}{billingAdjustments.slice(0, 5).map((item) => <div key={item.id} className="text-xs text-muted-foreground md:col-span-5">{new Date(item.creado_en).toLocaleString("es-MX")} · {item.tipo} · {money(item.importe)} · {item.motivo}</div>)}</CardContent></Card> : null}

      {isOwner && selectedTenant !== "all" && s?.periodos.length ? <Card><CardHeader className="px-3 py-2"><CardTitle className="text-sm">Cierre manual de periodos</CardTitle><CardDescription className="text-xs">Solo aparecen periodos del tenant seleccionado; el periodo actual no puede cerrarse.</CardDescription></CardHeader><CardContent className="space-y-2 px-3 pb-3 pt-0">{s.periodos.filter((item) => item.organizacion_id === selectedTenant).map((item) => { const closable = new Date(item.fecha_fin).getTime() <= Date.now() && (item.estado === "abierto" || item.estado === "en_revision"); return <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm"><div><span className="font-medium">{new Date(item.fecha_inicio).toLocaleDateString("es-MX")} – {new Date(item.fecha_fin).toLocaleDateString("es-MX")}</span><Badge variant="outline" className="ml-2">{item.estado}</Badge></div>{closable ? <Button size="sm" variant="outline" disabled={closingPeriodId === item.id} onClick={() => void closePeriod(item.id)}>{closingPeriodId === item.id ? "Cerrando..." : "Cerrar periodo"}</Button> : <span className="text-xs text-muted-foreground">No disponible</span>}</div> })}</CardContent></Card> : null}

      <Card>
        <CardHeader className="flex flex-row items-center px-2 py-1.5"><CardTitle className="text-sm">Filtros</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto px-2 pb-2 pt-0">
          <div className="flex min-w-max flex-nowrap items-end gap-3">
            <div className="w-40 shrink-0 space-y-0.5"><Label className="text-[10px] leading-3" htmlFor="billing-period">Periodo</Label><Select value={period} onValueChange={(value) => { setPeriod(value as PeriodPreset); setPage(1) }}><SelectTrigger className="h-7 w-full" id="billing-period"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(periodLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            {isOwner ? <div className="w-56 shrink-0 space-y-0.5"><Label className="text-[10px] leading-3" htmlFor="billing-tenant">Tenant</Label><Select value={selectedTenant} onValueChange={(value) => { setSelectedTenant(value); setPage(1) }}><SelectTrigger className="h-7 w-full" id="billing-tenant"><SelectValue placeholder="Tenant" /></SelectTrigger><SelectContent><SelectItem value="all">Todos los tenants</SelectItem>{tenantOptions.map((tenant) => <SelectItem key={tenant.id} value={tenant.id}>{tenant.nombre_comercial || tenant.nombre || tenant.id.slice(0, 8)}</SelectItem>)}</SelectContent></Select></div> : null}
            <div className="w-40 shrink-0 space-y-0.5"><Label className="text-[10px] leading-3" htmlFor="billing-category">Categoría Meta</Label><Select value={category} onValueChange={(value) => { setCategory(value); setPage(1) }}><SelectTrigger className="h-7 w-full" id="billing-category"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas las categorías</SelectItem><SelectItem value="marketing">Marketing</SelectItem><SelectItem value="utility">Utility</SelectItem><SelectItem value="authentication">Authentication</SelectItem><SelectItem value="service">Service</SelectItem><SelectItem value="unknown">Sin categoría</SelectItem></SelectContent></Select></div>
            <div className="w-32 shrink-0 space-y-0.5"><Label className="text-[10px] leading-3" htmlFor="billing-direction">Dirección</Label><Select value={direction} onValueChange={(value) => { setDirection(value); setPage(1) }}><SelectTrigger className="h-7 w-full" id="billing-direction"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas</SelectItem><SelectItem value="entrante">Entrantes</SelectItem><SelectItem value="saliente">Salientes</SelectItem></SelectContent></Select></div>
            {period === "manual" ? <><div className="w-32 shrink-0 space-y-0.5"><Label className="text-[10px] leading-3" htmlFor="billing-from">Desde</Label><Input className="h-7 w-full" id="billing-from" type="date" value={manualDesde} onChange={(event) => { setManualDesde(event.target.value); setPage(1) }} /></div><div className="w-32 shrink-0 space-y-0.5"><Label className="text-[10px] leading-3" htmlFor="billing-to">Hasta</Label><Input className="h-7 w-full" id="billing-to" type="date" value={manualHasta} onChange={(event) => { setManualHasta(event.target.value); setPage(1) }} /></div></> : null}
          </div>
          {manualRangeInvalid ? <p className="mt-1 text-[10px] leading-3 text-destructive">Rango manual inválido: completa ambas fechas y verifica el orden.</p> : null}
        </CardContent>
      </Card>

      {loading ? <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}</div> : s ? <section aria-labelledby="billing-kpis-title" className="space-y-3"><h2 id="billing-kpis-title" className="text-xl font-semibold">KPI&apos;s</h2><div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Mensajes" value={integer(s.mensajes_cantidad)} detail={`${integer(s.mensajes_entrantes_cantidad)} entrantes · ${integer(s.mensajes_salientes_cantidad)} salientes`} icon={IconMessageCircle} />
        <KpiCard label="Hilos activos" value={integer(s.hilos_con_actividad_cantidad)} detail={`${integer(s.conversiones_cantidad)} conversiones`} icon={IconChartBar} />
        <KpiCard label="Tarifa efectiva" value={isOwner ? "Global" : money(rate?.precio_mensaje)} detail={isOwner ? "Vista consolidada" : rate?.alcance === "tenant" ? "Override particular" : "Tarifa global"} icon={IconSettings} />
        <KpiCard label="Cargo GEOACTIV" value={money(s.cargo_app_total)} detail="$0.09 por mensaje según tarifa aplicada" icon={IconCoin} />
        <KpiCard label="Costo Meta" value={money(s.costo_meta_total)} detail="Informativo; lo paga el tenant a Meta" icon={IconSend} />
        <KpiCard label="Total consumo" value={money(s.total_consumo)} detail="GEOACTIV + costo Meta" icon={IconCoin} />
      </div></section> : null}

      {reconciliation ? <Card><CardHeader className="px-3 py-2"><CardTitle className="text-sm">Conciliación de callbacks Meta</CardTitle><CardDescription className="text-xs">Los eventos no generan cargos por sí mismos; solo se contabiliza el mensaje local asociado.</CardDescription></CardHeader><CardContent className="grid grid-cols-3 gap-2 px-3 pb-3 pt-0 text-center text-sm"><div className="rounded-md border p-2"><p className="text-xs text-muted-foreground">Pendientes</p><p className="font-semibold">{integer(reconciliation.pendiente)}</p></div><div className="rounded-md border p-2"><p className="text-xs text-muted-foreground">Vinculados</p><p className="font-semibold">{integer(reconciliation.vinculado)}</p></div><div className="rounded-md border border-amber-300/60 bg-amber-50/40 p-2 dark:bg-amber-950/20"><p className="text-xs text-muted-foreground">No conciliados</p><p className="font-semibold">{integer(reconciliation.no_conciliado)}</p></div></CardContent></Card> : null}

      {reconciliation?.no_conciliado ? <Card><CardHeader className="px-3 py-2"><CardTitle className="text-sm">Detalle de no conciliados</CardTitle><CardDescription className="text-xs">Últimos callbacks sin mensaje local. No representan cargos.</CardDescription></CardHeader><CardContent className="px-3 pb-3 pt-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow>{isOwner ? <TableHead>Tenant</TableHead> : null}<TableHead>Fecha</TableHead><TableHead>Evento</TableHead><TableHead>WAMID</TableHead><TableHead>Motivo</TableHead></TableRow></TableHeader><TableBody>{unreconciledEvents.map((item) => <TableRow key={item.id}>{isOwner ? <TableCell className="font-mono text-xs">{item.organizacion_id?.slice(0, 8) ?? "—"}…</TableCell> : null}<TableCell className="whitespace-nowrap">{new Date(item.creado_en).toLocaleString("es-MX")}</TableCell><TableCell>{item.evento}</TableCell><TableCell className="max-w-64 truncate font-mono text-xs">{item.proveedor_mensaje_id ?? "—"}</TableCell><TableCell>{item.conciliacion_motivo ?? "—"}</TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card> : null}

      {billingAlerts.length ? <Card><CardHeader className="px-3 py-2"><CardTitle className="text-sm">Alertas de consumo</CardTitle><CardDescription className="text-xs">Alertas generadas al alcanzar el porcentaje o límite configurado.</CardDescription></CardHeader><CardContent className="space-y-2 px-3 pb-3 pt-0">{billingAlerts.slice(0, 10).map((alert) => <div key={alert.id} className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm"><div><Badge variant={alert.severidad === "critical" ? "destructive" : "secondary"}>{alert.severidad}</Badge><Badge variant="outline" className="ml-2">{alert.estado}</Badge><span className="ml-2">{alert.mensaje}</span></div><div className="flex items-center gap-2"><span className="whitespace-nowrap text-xs text-muted-foreground">{new Date(alert.creado_en).toLocaleString("es-MX")}</span>{isOwner && alert.estado === "abierta" ? <><Button variant="ghost" size="sm" disabled={alertUpdating === alert.id} onClick={() => void updateAlertStatus(alert.id, "acknowledged")}>Atender</Button><Button variant="ghost" size="sm" disabled={alertUpdating === alert.id} onClick={() => void updateAlertStatus(alert.id, "resuelta")}>Resolver</Button></> : null}</div></div>)}</CardContent></Card> : null}

      <Card><CardHeader><CardTitle>Detalle de tarifas</CardTitle><CardDescription>Registro auditable por mensaje; los eventos de entrega no generan cargos adicionales.</CardDescription></CardHeader><CardContent>
        {messageLoading ? <Skeleton className="h-48 w-full" /> : messages?.items.length ? <><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Fecha</TableHead>{isOwner ? <TableHead>Tenant</TableHead> : null}<TableHead>Dirección</TableHead><TableHead>Meta</TableHead><TableHead>Estado</TableHead><TableHead className="text-right">GEOACTIV</TableHead><TableHead className="text-right">Meta</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader><TableBody>{messages.items.map((item) => <TableRow key={item.id}><TableCell className="whitespace-nowrap">{new Date(item.creado_en).toLocaleString("es-MX")}</TableCell>{isOwner ? <TableCell className="font-mono text-xs">{item.organizacion_id.slice(0, 8)}…</TableCell> : null}<TableCell><Badge variant={item.direccion === "saliente" ? "default" : "secondary"}>{item.direccion}</Badge></TableCell><TableCell><div>{item.categoria_meta}</div><span className="text-xs text-muted-foreground">{item.proveedor} · {item.canal}</span></TableCell><TableCell>{item.estado_proveedor}</TableCell><TableCell className="text-right">{money(item.cargo_app_importe)}</TableCell><TableCell className="text-right">{money(item.costo_meta_importe)}</TableCell><TableCell className="text-right font-medium">{money(item.costo_total_mensaje)}</TableCell></TableRow>)}</TableBody></Table></div><div className="mt-4 flex items-center justify-between text-sm text-muted-foreground"><span>{integer(messages.total)} mensajes</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</Button><span>Página {page} de {totalPages}</span><Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Siguiente</Button></div></div></> : <div className="py-12 text-center text-sm text-muted-foreground">Aún no hay mensajes contabilizados con estos filtros.</div>}
      </CardContent></Card>
    </div>
  )
}
