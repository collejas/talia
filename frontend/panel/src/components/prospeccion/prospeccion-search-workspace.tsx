import Link from "next/link"
import { IconBuildingStore, IconMapSearch } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export type ProspeccionSearchSource = "google" | "denue"

type ProspeccionSearchWorkspaceProps = {
  activeSource: ProspeccionSearchSource
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
