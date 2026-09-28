import Link from "next/link"
import { IconBuildingStore, IconMapSearch, IconRefresh } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

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

const SOURCE_CONFIG: Record<ProspeccionSearchSource, { label: string; description: string }> = {
  google: {
    label: "Google Places",
    description: "Busca por texto, ubicación, tipos de negocio y calificación.",
  },
  denue: {
    label: "GobMX / DENUE",
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
            <Link href="/prospeccion/google-busqueda">
              <IconBuildingStore className="mr-1.5 size-4" /> Google Places
            </Link>
          </Button>
          <Button asChild variant={activeSource === "denue" ? "secondary" : "outline"} size="sm">
            <Link href="/prospeccion/denue-busqueda">
              <IconBuildingStore className="mr-1.5 size-4" /> GobMX / DENUE
            </Link>
          </Button>
        </nav>
      </div>
    </section>
  )
}
