import Link from "next/link"
import type { ReactNode } from "react"
import { ArrowUpRight, Globe, Mail, Phone } from "lucide-react"
import { IconBuildingStore, IconCircleCheck, IconMapPin, IconMapSearch, IconRefresh, IconTrash } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"

export type ProspeccionSearchSource = "google" | "denue"

type ProspeccionSearchWorkspaceProps = {
  activeSource: ProspeccionSearchSource
}

type ProspeccionResultsSummaryProps = {
  loading: boolean
  total: number
  pageStart: number
  pageEnd: number
  descriptor?: string | null
  hasActiveSearch: boolean
  onRefresh: () => void
}

const numberFormatter = new Intl.NumberFormat("es-MX")

export function ProspeccionResultsSummary({
  loading,
  total,
  pageStart,
  pageEnd,
  descriptor,
  hasActiveSearch,
  onRefresh,
}: ProspeccionResultsSummaryProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-base font-semibold">Resultados almacenados</p>
        <p className="space-y-0.5 text-sm text-muted-foreground">
          <span className="block">
            {loading
              ? "Descargando datos…"
              : total
                ? `Mostrando ${numberFormatter.format(pageStart)}-${numberFormatter.format(pageEnd)} de ${numberFormatter.format(total)} coincidencias`
                : "0 coincidencias"}
          </span>
          {descriptor ? <span className="block text-muted-foreground/80">Búsqueda: {descriptor}</span> : null}
        </p>
      </div>
      <Button size="icon" variant="ghost" onClick={onRefresh} disabled={!hasActiveSearch || loading} aria-label="Actualizar resultados">
        <IconRefresh className={loading ? "size-4 animate-spin" : "size-4"} />
      </Button>
    </div>
  )
}

type ProspeccionResultsActionsProps = {
  canSave: boolean
  canDelete: boolean
  selectedCount: number
  totalCount: number
  saving: boolean
  deleting: boolean
  onSaveSelected: () => void
  onSaveFiltered: () => void
  onDelete: () => void
  children?: ReactNode
}

type ProspeccionResultsSelectionSummaryProps = {
  selectedCount: number
  selectedVisibleCount: number
  hasVisibleResults: boolean
  totalCount: number
  currentPage: number
  totalPages: number
  onSelectPage: () => void
  onClearPage: () => void
}

type ProspeccionResultsMapCardProps = {
  description: ReactNode
  onHelp: () => void
  children: ReactNode
}

export function ProspeccionResultsMapCard({ description, onHelp, children }: ProspeccionResultsMapCardProps) {
  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="text-base">Mapa de resultados</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Button type="button" size="icon" variant="ghost" onClick={onHelp} aria-label="Ayuda del mapa">
          <IconMapPin className="size-4" />
        </Button>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        <div className="h-full min-h-[460px]">{children}</div>
      </CardContent>
    </Card>
  )
}

type ProspeccionResultsPaginationProps = {
  loading: boolean
  hasPrevious: boolean
  hasNext: boolean
  total: number
  pageStart: number
  pageEnd: number
  onPrevious: () => void
  onNext: () => void
}

type ProspeccionResultCardProps = {
  selected: boolean
  activityLabel?: string | null
  descriptor?: string | null
  displayName: string
  address?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  websiteHref?: string | null
  distanceMeters?: number | null
  onToggle: (selected: boolean) => void
  headerAside?: ReactNode
  children?: ReactNode
}

export function ProspeccionResultCard({
  selected,
  activityLabel,
  descriptor,
  displayName,
  address,
  phone,
  email,
  website,
  websiteHref,
  distanceMeters,
  onToggle,
  headerAside,
  children,
}: ProspeccionResultCardProps) {
  const visibleActivity = activityLabel?.trim() || descriptor?.trim()

  return (
    <div className={cn("rounded-xl border p-3 text-sm transition", selected ? "border-primary bg-primary/5" : "border-border/60")}>
      <div className="flex items-start gap-3">
        <Checkbox checked={selected} onCheckedChange={(checked) => onToggle(Boolean(checked))} />
        <div className="flex-1 space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              {visibleActivity ? <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">{visibleActivity}</p> : null}
              <p className="font-semibold">{displayName}</p>
              <p className="text-xs text-muted-foreground">{address ?? "Sin dirección"}</p>
            </div>
            {headerAside}
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {phone ? (
              <span className="inline-flex items-center gap-1">
                <Phone className="size-3" />
                {phone}
              </span>
            ) : null}
            {email ? (
              <span className="inline-flex items-center gap-1">
                <Mail className="size-3" />
                {email}
              </span>
            ) : null}
            {website ? (
              <a className="inline-flex items-center gap-1 text-primary" href={websiteHref ?? website} target="_blank" rel="noreferrer">
                <Globe className="size-3" />
                Sitio web
                <ArrowUpRight className="size-3" />
              </a>
            ) : null}
            {typeof distanceMeters === "number" ? <span>{(distanceMeters / 1000).toFixed(2)} km</span> : null}
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}

export function ProspeccionResultsPagination({
  loading,
  hasPrevious,
  hasNext,
  total,
  pageStart,
  pageEnd,
  onPrevious,
  onNext,
}: ProspeccionResultsPaginationProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-xs text-muted-foreground">
      <Button type="button" variant="ghost" size="sm" onClick={onPrevious} disabled={loading || !hasPrevious}>
        Anterior
      </Button>
      <span>
        {total === 0
          ? "No hay registros"
          : `Mostrando ${numberFormatter.format(pageStart)}-${numberFormatter.format(pageEnd)} de ${numberFormatter.format(total)}`}
      </span>
      <Button type="button" variant="ghost" size="sm" onClick={onNext} disabled={loading || !hasNext}>
        Siguiente
      </Button>
    </div>
  )
}

export function ProspeccionResultsSelectionSummary({
  selectedCount,
  selectedVisibleCount,
  hasVisibleResults,
  totalCount,
  currentPage,
  totalPages,
  onSelectPage,
  onClearPage,
}: ProspeccionResultsSelectionSummaryProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-2">
        <span>
          Seleccionados: {numberFormatter.format(selectedCount)}{" "}
          {selectedVisibleCount && selectedVisibleCount !== selectedCount
            ? `(en vista: ${selectedVisibleCount})`
            : null}
        </span>
        <Button type="button" size="sm" variant="ghost" onClick={onSelectPage} disabled={!hasVisibleResults}>
          Seleccionar página
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClearPage} disabled={!hasVisibleResults}>
          Quitar selección
        </Button>
      </div>
      <p>
        {numberFormatter.format(totalCount)} registros · página {currentPage + 1} de {totalPages}
      </p>
    </div>
  )
}

export function ProspeccionResultsActions({
  canSave,
  canDelete,
  selectedCount,
  totalCount,
  saving,
  deleting,
  onSaveSelected,
  onSaveFiltered,
  onDelete,
  children,
}: ProspeccionResultsActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canSave ? (
        <Button type="button" size="sm" onClick={onSaveSelected} disabled={!selectedCount || saving} className="flex items-center gap-2">
          {saving ? <IconRefresh className="size-4 animate-spin" /> : <IconCircleCheck className="size-4" />}
          Guardar como prospectos
        </Button>
      ) : null}
      {canSave ? (
        <Button type="button" size="sm" variant="secondary" onClick={onSaveFiltered} disabled={totalCount <= 0 || saving} className="flex items-center gap-2">
          {saving ? <IconRefresh className="size-4 animate-spin" /> : <IconCircleCheck className="size-4" />}
          Guardar filtrados (todas las páginas)
        </Button>
      ) : null}
      {canDelete ? (
        <Button type="button" size="sm" variant="destructive" onClick={onDelete} disabled={!selectedCount || deleting} className="flex items-center gap-2">
          {deleting ? <IconRefresh className="size-4 animate-spin" /> : <IconTrash className="size-4" />}
          Eliminar seleccionados
        </Button>
      ) : null}
      {children}
    </div>
  )
}

const SOURCE_CONFIG: Record<ProspeccionSearchSource, { label: string; description: string }> = {
  google: {
    label: "Google Places",
    description: "Busca por texto, ubicación, tipos de negocio y calificación.",
  },
  denue: {
    label: "GobMX",
    description: "Busca por actividad económica, tamaño de empresa y geografía.",
  },
}

export function ProspeccionSearchWorkspace({ activeSource }: ProspeccionSearchWorkspaceProps) {
  const active = SOURCE_CONFIG[activeSource]

  return (
    <section className="rounded-2xl border bg-card/80 p-4 shadow-sm" aria-label="Workspace de búsqueda">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <IconMapSearch className="size-5" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold">Buscar empresas</h2>
              <Badge variant="secondary">Fuente activa: {active.label}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{active.description}</p>
          </div>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="Fuentes de búsqueda">
          <Button asChild variant={activeSource === "google" ? "secondary" : "outline"} size="sm">
            <Link href="/prospeccion/busqueda?fuente=google">
              <IconBuildingStore className="mr-1.5 size-4" /> Google Places
            </Link>
          </Button>
          <Button asChild variant={activeSource === "denue" ? "secondary" : "outline"} size="sm">
            <Link href="/prospeccion/busqueda?fuente=denue">
              <IconBuildingStore className="mr-1.5 size-4" /> GobMX
            </Link>
          </Button>
        </nav>
      </div>
    </section>
  )
}
