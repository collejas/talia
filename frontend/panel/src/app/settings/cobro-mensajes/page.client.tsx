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
type Rate = { precio_mensaje?: number | string; precio_unitario?: number | string; moneda?: string; alcance?: string; categoria_meta?: string }
type TenantOption = { id: string; nombre: string | null; nombre_comercial: string | null; activo: boolean }

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
  const [rate, setRate] = React.useState<Rate | null>(null)
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

  const scopePrefix = isOwner ? "/master" : ""
  const summaryUrl = `/api/billing${scopePrefix}/summary${isOwner && selectedTenant !== "all" ? `?organizacion_id=${encodeURIComponent(selectedTenant)}` : ""}`
  const messagesUrl = `/api/billing${scopePrefix}/messages`

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
    const controller = new AbortController()
    setLoading(true)
    Promise.all([
      fetch(summaryUrl, { cache: "no-store", signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error(await errorText(response, "No se pudo consultar el resumen."))
        return response.json() as Promise<Summary>
      }),
      isOwner ? Promise.resolve(null) : fetch("/api/billing/tariff/effective", { cache: "no-store", signal: controller.signal }).then((response) => response.ok ? response.json() : null),
    ]).then(([summaryData, rateData]) => {
      setSummary(summaryData)
      setRate(rateData?.tarifa ?? null)
      setError(null)
    }).catch((fetchError) => {
      if ((fetchError as Error).name !== "AbortError") setError(fetchError instanceof Error ? fetchError.message : "No se pudo cargar billing.")
    }).finally(() => setLoading(false))
    return () => controller.abort()
  }, [isOwner, refreshToken, summaryUrl])

  React.useEffect(() => {
    const controller = new AbortController()
    setMessageLoading(true)
    const params = new URLSearchParams({ page: String(page), page_size: "25" })
    if (isOwner && selectedTenant !== "all") params.set("organizacion_id", selectedTenant)
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
  }, [category, direction, isOwner, messagesUrl, page, refreshToken, selectedTenant])

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

      {loading ? <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}</div> : s ? <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Mensajes" value={integer(s.mensajes_cantidad)} detail={`${integer(s.mensajes_entrantes_cantidad)} entrantes · ${integer(s.mensajes_salientes_cantidad)} salientes`} icon={IconMessageCircle} />
        <KpiCard label="Hilos activos" value={integer(s.hilos_con_actividad_cantidad)} detail={`${integer(s.conversiones_cantidad)} conversiones`} icon={IconChartBar} />
        <KpiCard label="Tarifa efectiva" value={isOwner ? "Global" : money(rate?.precio_mensaje)} detail={isOwner ? "Vista consolidada" : rate?.alcance === "tenant" ? "Override particular" : "Tarifa global"} icon={IconSettings} />
        <KpiCard label="Cargo GEOACTIV" value={money(s.cargo_app_total)} detail="$0.09 por mensaje según tarifa aplicada" icon={IconCoin} />
        <KpiCard label="Costo Meta" value={money(s.costo_meta_total)} detail="Informativo; lo paga el tenant a Meta" icon={IconSend} />
        <KpiCard label="Total consumo" value={money(s.total_consumo)} detail="GEOACTIV + costo Meta" icon={IconCoin} />
      </div> : null}

      {isOwner ? <Card><CardHeader><CardTitle>Configuración de tarifas</CardTitle><CardDescription>Solo el owner puede crear nuevas versiones. Los históricos no se recalculan.</CardDescription></CardHeader><CardContent className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border p-4"><p className="font-medium">Cargo GEOACTIV</p><div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="app-price">Precio por mensaje (MXN)</Label><Input id="app-price" type="number" min="0" step="0.0001" value={appPrice} onChange={(event) => setAppPrice(event.target.value)} /></div><div><Label htmlFor="tenant-override">Tenant particular (opcional)</Label><Input id="tenant-override" placeholder="UUID del tenant" value={tenantOverride} onChange={(event) => setTenantOverride(event.target.value)} /></div></div><Button onClick={() => void saveRate("app")} disabled={saving}>{saving ? "Guardando..." : "Guardar tarifa GEOACTIV"}</Button></div>
        <div className="space-y-3 rounded-lg border p-4"><p className="font-medium">Costo publicado Meta</p><div><Label htmlFor="provider-price">Precio Meta por mensaje (MXN)</Label><Input id="provider-price" type="number" min="0" step="0.0001" value={providerPrice} onChange={(event) => setProviderPrice(event.target.value)} /></div><Button variant="outline" onClick={() => void saveRate("provider")} disabled={saving}>{saving ? "Guardando..." : "Guardar tarifa Meta"}</Button></div>
        {saveMessage ? <p className="text-sm text-muted-foreground lg:col-span-2">{saveMessage}</p> : null}
      </CardContent></Card> : null}

      <Card><CardHeader className="flex flex-wrap flex-row items-end justify-between gap-3"><div><CardTitle>Detalle de mensajes</CardTitle><CardDescription>Registro auditable por mensaje; los eventos de entrega no generan cargos adicionales.</CardDescription></div><div className="flex flex-wrap gap-2">{isOwner ? <><Select value={selectedTenant} onValueChange={(value) => { setSelectedTenant(value); setPage(1) }}><SelectTrigger className="w-56"><SelectValue placeholder="Tenant" /></SelectTrigger><SelectContent><SelectItem value="all">Todos los tenants</SelectItem>{tenantOptions.map((tenant) => <SelectItem key={tenant.id} value={tenant.id}>{tenant.nombre_comercial || tenant.nombre || tenant.id.slice(0, 8)}</SelectItem>)}</SelectContent></Select>{tenantsLoading ? <span className="self-center text-xs text-muted-foreground">Cargando tenants…</span> : null}</> : null}<Select value={category} onValueChange={(value) => { setCategory(value); setPage(1) }}><SelectTrigger className="w-40"><SelectValue placeholder="Categoría Meta" /></SelectTrigger><SelectContent><SelectItem value="all">Todas las categorías</SelectItem><SelectItem value="marketing">Marketing</SelectItem><SelectItem value="utility">Utility</SelectItem><SelectItem value="authentication">Authentication</SelectItem><SelectItem value="service">Service</SelectItem><SelectItem value="unknown">Sin categoría</SelectItem></SelectContent></Select><Select value={direction} onValueChange={(value) => { setDirection(value); setPage(1) }}><SelectTrigger className="w-36"><SelectValue placeholder="Dirección" /></SelectTrigger><SelectContent><SelectItem value="all">Todas</SelectItem><SelectItem value="entrante">Entrantes</SelectItem><SelectItem value="saliente">Salientes</SelectItem></SelectContent></Select></div></CardHeader><CardContent>
        {messageLoading ? <Skeleton className="h-48 w-full" /> : messages?.items.length ? <><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Fecha</TableHead>{isOwner ? <TableHead>Tenant</TableHead> : null}<TableHead>Dirección</TableHead><TableHead>Meta</TableHead><TableHead>Estado</TableHead><TableHead className="text-right">GEOACTIV</TableHead><TableHead className="text-right">Meta</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader><TableBody>{messages.items.map((item) => <TableRow key={item.id}><TableCell className="whitespace-nowrap">{new Date(item.creado_en).toLocaleString("es-MX")}</TableCell>{isOwner ? <TableCell className="font-mono text-xs">{item.organizacion_id.slice(0, 8)}…</TableCell> : null}<TableCell><Badge variant={item.direccion === "saliente" ? "default" : "secondary"}>{item.direccion}</Badge></TableCell><TableCell><div>{item.categoria_meta}</div><span className="text-xs text-muted-foreground">{item.proveedor} · {item.canal}</span></TableCell><TableCell>{item.estado_proveedor}</TableCell><TableCell className="text-right">{money(item.cargo_app_importe)}</TableCell><TableCell className="text-right">{money(item.costo_meta_importe)}</TableCell><TableCell className="text-right font-medium">{money(item.costo_total_mensaje)}</TableCell></TableRow>)}</TableBody></Table></div><div className="mt-4 flex items-center justify-between text-sm text-muted-foreground"><span>{integer(messages.total)} mensajes</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</Button><span>Página {page} de {totalPages}</span><Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Siguiente</Button></div></div></> : <div className="py-12 text-center text-sm text-muted-foreground">Aún no hay mensajes contabilizados con estos filtros.</div>}
      </CardContent></Card>
    </div>
  )
}
