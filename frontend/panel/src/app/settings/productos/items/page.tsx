import Link from "next/link"
import type { ComponentType } from "react"

import {
  IconArrowRight,
  IconBox,
  IconBuildingFactory,
  IconHierarchy,
  IconPhoto,
} from "@tabler/icons-react"

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
} from "@/app/settings/productos/actions"

type OverviewCard = {
  title: string
  description: string
  href: string
  stat: string
  actionText: string
  icon: ComponentType<{ className?: string }>
}

function buildOverviewCards(
  itemsCount: number,
  lineasCount: number,
  familiasCount: number,
  modelosCount: number,
): OverviewCard[] {
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
    {
      title: "Catálogo y precios",
      description: "Administra productos, servicios e impuestos alineados con tus líneas/familias/modelos.",
      href: "/settings/catalogo",
      stat: `${formatter.format(itemsCount)} ítems`,
      actionText: "Ir al catálogo",
      icon: IconPhoto,
    },
  ]
}

function SummaryCard({
  title,
  children,
  href,
  action,
}: {
  title: string
  children: React.ReactNode
  href?: string
  action?: React.ReactNode
}) {
  return (
    <Card className="flex flex-col gap-3">
      <CardHeader>
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{children}</CardContent>
      {href && (
        <CardFooter className="pt-0">
          <Button size="sm" variant="ghost" className="w-full" asChild>
            <Link href={href}>{action ?? "Ver detalles"}</Link>
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}

export default async function SettingsProductosItemsPage() {
  const [items, lineas, familias, modelos] = await Promise.all([
    fetchCatalogItems({ includeInactive: true }),
    fetchLineasDeNegocio({ includeInactive: true }),
    fetchFamiliasDeProductos({ includeInactive: true }),
    fetchModelosProductos({ includeInactive: true }),
  ])
  const overviewCards = buildOverviewCards(
    items.length,
    lineas.length,
    familias.length,
    modelos.length,
  )
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
        <div className="grid gap-4 md:grid-cols-3">
          <SummaryCard
            title="Relación entre jerarquías"
            href="/settings/productos/lineas"
            action={
              <div className="flex items-center justify-center gap-2">
                <IconArrowRight className="h-4 w-4" />
                Ir a la línea/familia/modelo principal
              </div>
            }
          >
            Asigna cada producto a una línea, familia y modelo para mantener la consistencia. Todas estas
            relaciones se almacenan en las nuevas tablas `lineas_de_negocio`, `familias_productos` y
            `modelos_productos`.
          </SummaryCard>
          <SummaryCard
            title="Recursos multimedia (recursos_media)"
            href="/settings/catalogo"
            action="Agregar imágenes"
          >
            Usa la tabla `recursos_media` para enlazar fotos de portada o galerías a tus productos, familias
            o modelos. Las URLs se almacenan en Supabase Storage y se pueden referenciar desde cualquier
            ítem del catálogo.
          </SummaryCard>
          <SummaryCard title="Estado del catálogo">
            {items.length
              ? "Actualiza tus ítems para reflejar nuevas condiciones comerciales y conecta cada uno con las jerarquías y recursos."
              : "Crea el primer producto o servicio y asigna línea/familia/modelo para poder utilizarlo en cotizaciones."}
          </SummaryCard>
        </div>
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
