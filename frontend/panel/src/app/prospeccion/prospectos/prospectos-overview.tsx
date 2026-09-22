import type { ComponentType } from "react"
import Link from "next/link"
import { IconAlertTriangle, IconLoader, IconRefresh } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { PROSPECCION_SOURCE_LABELS } from "@/lib/prospeccion/source-labels"
import type { ContactoBatch, ProspectosSavedView } from "@/lib/prospeccion/prospectos-client"

export type ProspectosFlowStep = {
  key: string
  title: string
  description: string
  icon: ComponentType<{ className?: string }>
  meta?: string
  isCurrent?: boolean
}

type ProspectosFlowProps = {
  steps: ProspectosFlowStep[]
  loading: boolean
  onPrepare: () => void
}

export function ProspectosFlow({ steps, loading, onPrepare }: ProspectosFlowProps) {
  return (
    <section className="rounded-2xl border bg-card/80 p-4 shadow-sm" aria-label="Flujo de envíos">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">Flujo de envíos</p>
          <p className="text-base text-muted-foreground">
            Selecciona prospectos, configura el canal y monitorea el resultado de cada envío.
          </p>
        </div>
        <Button size="sm" onClick={onPrepare}>
          Preparar envíos
        </Button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((step) => {
          const StepIcon = step.icon
          return (
            <div
              key={step.key}
              className={cn(
                "flex min-h-0 flex-col rounded-xl border bg-background/70 p-3 text-sm transition",
                step.isCurrent ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
              )}
            >
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
                <span
                  className={cn(
                    "inline-flex items-center justify-center rounded-full p-1",
                    step.isCurrent ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                  )}
                >
                  <StepIcon className="size-3.5" />
                </span>
                <span>{step.title}</span>
                {step.isCurrent ? <Badge variant="secondary" className="ml-auto text-[10px]">Actual</Badge> : null}
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{step.description}</p>
              <span className="mt-2 text-[11px] font-medium text-foreground/70">
                {loading && (step.key === "launch" || step.key === "evaluate") ? "Actualizando…" : step.meta}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

type ProspectosRecentBatchesProps = {
  batches: ContactoBatch[]
  loading: boolean
  error: string | null
  onRefresh: () => void
}

const CHANNEL_LABELS: Record<string, string> = {
  correo: "Correo",
  whatsapp: "WhatsApp",
  llamada: "Llamada/voz",
}

const CHANNEL_BADGE_CLASS: Record<string, string> = {
  correo: "border-sky-200 bg-sky-50 text-sky-700",
  whatsapp: "border-emerald-200 bg-emerald-50 text-emerald-700",
  llamada: "border-amber-200 bg-amber-50 text-amber-700",
}

export function ProspectosRecentBatches({ batches, loading, error, onRefresh }: ProspectosRecentBatchesProps) {
  return (
    <section className="rounded-2xl border bg-card/80 p-4 shadow-sm" aria-label="Últimos envíos">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Últimos envíos programados</p>
          <p className="text-xs text-muted-foreground">
            Consulta rápidamente cómo van las campañas más recientes y abre el monitor detallado si necesitas más contexto.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onRefresh} disabled={loading}>
            <IconRefresh className={cn("mr-1.5 size-4", loading && "animate-spin")} />
            Actualizar
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/prospeccion/metricas">Ver resultados</Link>
          </Button>
        </div>
      </div>
      {error ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <IconAlertTriangle className="size-4" />
          <span className="flex-1">{error}</span>
        </div>
      ) : null}
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {loading && !batches.length ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div key={`batch-skeleton-${index}`} className="rounded-xl border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
              <IconLoader className="mb-1 size-4 animate-spin" />
              Cargando envío...
            </div>
          ))
        ) : batches.length ? (
          batches.map((batch) => {
            const metrics = batchDeliveryMetrics(batch.totales, batch.total_envios)
            return (
              <div key={batch.id} className="flex h-full max-w-[280px] flex-col rounded-lg border bg-background/80 p-2.5 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold">{batch.titulo?.trim() || "Envío"}</p>
                    <p className="text-xs text-muted-foreground">{formatBatchDate(batch.programado_en ?? batch.creado_en)}</p>
                  </div>
                  <Badge variant="secondary" className="text-[11px]" title="Enviados positivos / total de envíos procesados.">
                    {metrics.positives.toLocaleString("es-MX")}/{metrics.total.toLocaleString("es-MX")} ({metrics.percent.toFixed(1)}%)
                  </Badge>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {(batch.total_prospectos ?? 0).toLocaleString("es-MX")} prospectos · {(batch.canales ?? []).map((canal) => CHANNEL_LABELS[canal] ?? canal).join(", ") || "Sin canales"}
                </p>
                {typeof batch.metadata?.["campana_nombre"] === "string" ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">Campaña: {String(batch.metadata["campana_nombre"])}</p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(batch.canales ?? []).map((canal) => (
                    <Badge key={`${batch.id}-${canal}`} variant="outline" className={cn("px-1.5 py-0 text-[10px]", CHANNEL_BADGE_CLASS[canal] ?? "border-muted text-muted-foreground")}>
                      {CHANNEL_LABELS[canal] ?? canal}
                    </Badge>
                  ))}
                </div>
                <div className="mt-2 flex flex-1 items-end justify-end text-[11px] text-muted-foreground">
                  <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-[11px]">
                    <Link href="/prospeccion/metricas">Ver resultados</Link>
                  </Button>
                </div>
              </div>
            )
          })
        ) : (
          <div className="rounded-xl border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
            No hay envíos recientes. Crea una campaña desde “Preparar envíos” para verla aquí.
          </div>
        )}
      </div>
    </section>
  )
}

type ProspectosSavedViewsProps = {
  views: ProspectosSavedView[]
  selectedId: string
  name: string
  loading: boolean
  saving: boolean
  onSelect: (value: string) => void
  onNameChange: (value: string) => void
  onSave: () => void
  onDelete: () => void
}

export function ProspectosSavedViews({
  views,
  selectedId,
  name,
  loading,
  saving,
  onSelect,
  onNameChange,
  onSave,
  onDelete,
}: ProspectosSavedViewsProps) {
  return (
    <>
      <div className="grid gap-2 lg:grid-cols-[minmax(240px,320px)_minmax(220px,1fr)_auto_auto]">
        <div className="space-y-1">
          <Label>Vistas guardadas</Label>
          <Select value={selectedId || "none"} onValueChange={onSelect}>
            <SelectTrigger>
              <SelectValue placeholder="Sin vista seleccionada" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin vista seleccionada</SelectItem>
              {views.map((view) => (
                <SelectItem key={view.id} value={view.id}>
                  {view.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Nombre de la vista</Label>
          <Input value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="Ej. Prospectos GobMX Norte" maxLength={120} />
        </div>
        <div className="flex items-end">
          <Button type="button" variant="secondary" size="sm" onClick={onSave} disabled={saving}>
            Guardar vista
          </Button>
        </div>
        <div className="flex items-end">
          <Button type="button" variant="outline" size="sm" onClick={onDelete} disabled={!selectedId || selectedId === "none" || saving}>
            Eliminar vista
          </Button>
        </div>
      </div>
      {loading ? <p className="text-xs text-muted-foreground">Cargando vistas guardadas...</p> : null}
    </>
  )
}

type ProspectosSourceVerificationProps = {
  fuente: string
  lookupStatus: string
  emailLookupStatus: string
  websiteLookupStatus: string
  onFuenteChange: (value: string) => void
  onLookupStatusChange: (value: string) => void
  onEmailLookupStatusChange: (value: string) => void
  onWebsiteLookupStatusChange: (value: string) => void
}

export function ProspectosSourceVerification({
  fuente,
  lookupStatus,
  emailLookupStatus,
  websiteLookupStatus,
  onFuenteChange,
  onLookupStatusChange,
  onEmailLookupStatusChange,
  onWebsiteLookupStatusChange,
}: ProspectosSourceVerificationProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-1">
        <Label>Fuente</Label>
        <Select value={fuente || "all"} onValueChange={onFuenteChange}>
          <SelectTrigger>
            <SelectValue placeholder="Todas las fuentes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="google_places">Google Places</SelectItem>
            <SelectItem value="denue">{PROSPECCION_SOURCE_LABELS.denue}</SelectItem>
            <SelectItem value="usuario">Usuario</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <FilterSelect label="Estado verificación teléfono" value={lookupStatus} onChange={onLookupStatusChange} options={[
        ["pendiente", "Pendiente"], ["verificado", "Verificado"], ["sin_numero", "Sin número"], ["error", "Error"],
      ]} />
      <FilterSelect label="Estado verificación correo" value={emailLookupStatus} onChange={onEmailLookupStatusChange} options={[
        ["pendiente", "Pendiente"], ["sin_email", "Sin correo"], ["valido", "Válido"], ["invalido", "Inválido"],
        ["dudoso", "Dudoso"], ["omitido_por_sitio", "Omitido por sitio"], ["error", "Error"],
      ]} />
      <FilterSelect label="Estado verificación sitio web" value={websiteLookupStatus} onChange={onWebsiteLookupStatusChange} options={[
        ["pendiente", "Pendiente"], ["sin_sitio", "Sin sitio"], ["valido", "Válido"], ["dudoso", "Dudoso"],
        ["invalido", "Inválido"], ["error", "Error"],
      ]} />
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<[string, string]>
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={value || "all"} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Todos los estados" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          {options.map(([optionValue, optionLabel]) => (
            <SelectItem key={optionValue} value={optionValue}>{optionLabel}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

type ProspectosCampaignFiltersProps = {
  campaignId: string
  templateId: string
  campaignOptions: Array<{ id: string; nombre: string }>
  templateOptions: Array<{ id: string; nombre: string }>
  campaignLoading: boolean
  templateLoading: boolean
  envioModo: "" | "si" | "no"
  envioCanales: Array<"correo" | "whatsapp" | "llamada">
  scraper: "" | "si" | "no"
  onCampaignChange: (value: string) => void
  onTemplateChange: (value: string) => void
  onEnvioModoChange: (value: string) => void
  onEnvioCanalesChange: (canales: Array<"correo" | "whatsapp" | "llamada">) => void
  onScraperChange: (value: string) => void
}

export function ProspectosCampaignFilters({
  campaignId,
  templateId,
  campaignOptions,
  templateOptions,
  campaignLoading,
  templateLoading,
  envioModo,
  envioCanales,
  scraper,
  onCampaignChange,
  onTemplateChange,
  onEnvioModoChange,
  onEnvioCanalesChange,
  onScraperChange,
}: ProspectosCampaignFiltersProps) {
  const channelLabels = { correo: "Correo", whatsapp: "WhatsApp", llamada: "Voz" }
  const envioLabel = envioModo === "no"
    ? `Sin envío${envioCanales.length ? ` · ${envioCanales.length} canal${envioCanales.length > 1 ? "es" : ""}` : ""}`
    : envioCanales.length === 0
      ? envioModo === "si" ? "Con envío" : "Todos"
      : `Con envío · ${envioCanales.length} canal${envioCanales.length > 1 ? "es" : ""}`

  const toggleChannel = (canal: "correo" | "whatsapp" | "llamada", checked: boolean) => {
    const next = new Set(envioCanales)
    if (checked) next.add(canal)
    else next.delete(canal)
    onEnvioCanalesChange(Array.from(next))
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-1">
        <Label>Campaña</Label>
        <Select value={campaignId || "all"} onValueChange={onCampaignChange}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder={campaignLoading ? "Cargando..." : "Todas las campañas"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {campaignOptions.map((option) => <SelectItem key={option.id} value={option.id}>{option.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Plantilla</Label>
        <Select value={templateId || "all"} onValueChange={onTemplateChange} disabled={!campaignId || templateLoading || !templateOptions.length}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder={!campaignId ? "Selecciona campaña" : templateLoading ? "Cargando..." : "Todas las plantillas"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {templateOptions.map((template) => <SelectItem key={template.id} value={template.id}>{template.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Con envío</Label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-[170px] justify-between">
              {envioLabel}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuRadioGroup value={envioModo || "all"} onValueChange={onEnvioModoChange}>
              <DropdownMenuRadioItem value="all">Todos</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="si">Con envío</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="no">Sin envío</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuItem onSelect={() => onEnvioCanalesChange([])}>Limpiar canales</DropdownMenuItem>
            {(["correo", "whatsapp", "llamada"] as const).map((canal) => (
              <DropdownMenuCheckboxItem key={canal} checked={envioCanales.includes(canal)} onCheckedChange={(value) => toggleChannel(canal, Boolean(value))}>
                {channelLabels[canal]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="space-y-1">
        <Label>Con scraper</Label>
        <Select value={scraper || "all"} onValueChange={onScraperChange}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Todos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="si">Sí</SelectItem>
            <SelectItem value="no">No</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

function formatBatchDate(value?: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(date)
}

function batchDeliveryMetrics(totals?: Record<string, number> | null, totalEnvios?: number | null) {
  const source = totals ?? {}
  const positives = Object.entries(source).reduce((acc, [rawState, rawCount]) => {
    const state = rawState.toLowerCase()
    const count = Number(rawCount) || 0
    return ["enviada", "enviado", "entregada", "entregado", "leida", "leido", "respondido"].includes(state)
      ? acc + count
      : acc
  }, 0)
  const computedTotal = Object.values(source).reduce((acc, rawCount) => acc + (Number(rawCount) || 0), 0)
  const total = Math.max(positives, Number(totalEnvios) || computedTotal || 0)
  return { positives, total, percent: total > 0 ? (positives / total) * 100 : 0 }
}
