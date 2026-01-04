import Link from "next/link"
import type { ComponentType } from "react"

import { IconBox, IconBuildingFactory, IconDatabase, IconHierarchy } from "@tabler/icons-react"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { CatalogItemsPanel } from "@/components/settings/catalog-items-panel"
import { fetchCatalogItems } from "@/app/settings/catalogo/actions"
import {
  fetchFamiliasDeProductos,
  fetchLineasDeNegocio,
  fetchModelosProductos,
  fetchCatalogVectorStoreStatus,
  type CatalogVectorStoreStatus,
} from "@/app/settings/productos/actions"

type OverviewCard = {
  title: string
  description: string
  href: string
  stat: string
  actionText: string
  icon: ComponentType<{ className?: string }>
}

type VectorStoreStatusCardProps = {
  status: CatalogVectorStoreStatus
}

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
})

function formatTimestamp(value: string | null) {
  if (!value) {
    return "Sin registros"
  }
  return DATE_TIME_FORMATTER.format(new Date(value))
}

function describeChannel(channel: string | null) {
  if (!channel || !channel.trim()) {
    return "Canal desconocido"
  }
  return `Canal ${channel}`
}

function VectorStoreStatusCard({ status }: VectorStoreStatusCardProps) {
  return (
    <Card className="border border-border">
      <CardHeader className="space-y-2">
        <div className="flex items-center gap-2">
          <IconDatabase className="h-5 w-5 text-primary" />
          <CardTitle className="text-base font-semibold">Vector store del catálogo</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground">
          La vector store se reindexa tras cada creación o edición de líneas, familias, modelos o
          productos. Este bloque muestra la última reindexación registrada y la última vez que el
          asistente consultó los embeddings.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Última reindexación</p>
          <p className="text-sm font-semibold">{formatTimestamp(status.lastReindexAt)}</p>
          <p className="text-xs text-muted-foreground">{describeChannel(status.lastReindexChannel)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Última consulta</p>
          <p className="text-sm font-semibold">{formatTimestamp(status.lastQueryAt)}</p>
          <p className="text-xs text-muted-foreground">{describeChannel(status.lastQueryChannel)}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function buildOverviewCards(lineasCount: number, familiasCount: number, modelosCount: number): OverviewCard[] {
  const formatter = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 })
  return [
    {
      title: "Líneas de negocio",
      description:
        "Agrupa bloques comerciales multitenant antes de vincular familias y productos del catálogo.",
      href: "/settings/productos/lineas",
      stat: `${formatter.format(lineasCount)} líneas`,
      actionText: "Gestionar líneas",
      icon: IconHierarchy,
    },
    {
      title: "Familias de productos",
      description: "Categoriza productos por segmento y aplica reglas compartidas en cada línea.",
      href: "/settings/productos/familias",
      stat: `${formatter.format(familiasCount)} familias`,
      actionText: "Ver familias",
      icon: IconBox,
    },
    {
      title: "Modelos y variantes",
      description:
        "Estandariza atributos de productos relacionados para reutilizarlos en cotizaciones y bundles.",
      href: "/settings/productos/modelos",
      stat: `${formatter.format(modelosCount)} modelos`,
      actionText: "Explorar modelos",
      icon: IconBuildingFactory,
    },
  ]
}

export default async function SettingsProductosItemsPage() {
  const [items, lineas, familias, modelos, vectorStoreStatus] = await Promise.all([
    fetchCatalogItems({ includeInactive: true }),
    fetchLineasDeNegocio({ includeInactive: true }),
    fetchFamiliasDeProductos({ includeInactive: true }),
    fetchModelosProductos({ includeInactive: true }),
    fetchCatalogVectorStoreStatus(),
  ])
  const overviewCards = buildOverviewCards(lineas.length, familias.length, modelos.length)
  return (
    <AppViewLayout title="Settings · Productos y servicios">
      <div className="space-y-6 px-4 py-6 lg:px-6">
        <header className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Productos y servicios
          </p>
          <h1 className="text-2xl font-semibold">Ítems del catálogo</h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Organiza tus líneas, familias, modelos y productos/servicios con fotos, costos,
            impuestos y recursos multimedia. Esto hace que todos los bloques del catálogo estén alineados
            con las nuevas tablas jerárquicas.
          </p>
        </header>
        <VectorStoreStatusCard status={vectorStoreStatus} />
        <div className="grid gap-4 md:grid-cols-2">{overviewCards.map((card) => (
          <Card key={card.title} className="flex h-full flex-col justify-between">
            <CardHeader className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <card.icon className="h-5 w-5 text-primary" />
                <CardTitle className="text-base font-semibold">{card.title}</CardTitle>
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {card.stat}
              </p>
            </CardHeader>
            <CardContent className="flex-1">
              <p className="text-sm text-muted-foreground">{card.description}</p>
            </CardContent>
            <CardFooter className="pt-0">
              <Button size="sm" variant="outline" className="w-full" asChild>
                <Link href={card.href}>{card.actionText}</Link>
              </Button>
            </CardFooter>
          </Card>
        ))}</div>
        <Separator />
        <CatalogItemsPanel
          initialItems={items}
          lineas={lineas}
          familias={familias}
          modelos={modelos}
        />
      </div>
    </AppViewLayout>
  )
}
