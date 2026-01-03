import Link from "next/link"
import type { ComponentType } from "react"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { CatalogItemsPanel } from "@/components/settings/catalog-items-panel"
import { fetchCatalogItems } from "@/app/settings/catalogo/actions"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  IconBox,
  IconBuildingFactory,
  IconHierarchy,
  IconPhoto,
} from "@tabler/icons-react"

type OverviewCard = {
  title: string
  description: string
  href: string
  stat: string
  actionText: string
  icon: ComponentType<{ className?: string }>
}

function buildOverviewCards(itemsCount: number): OverviewCard[] {
  const formattedItems = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(
    itemsCount,
  )

  return [
    {
      title: "Líneas de negocio",
      description:
        "Organiza los bloques de oferta principales de cada organización antes de crear familias o productos.",
      href: "/settings/productos/lineas",
      stat: "Sin registros aún",
      actionText: "Gestionar líneas",
      icon: IconHierarchy,
    },
    {
      title: "Familias de productos",
      description: "Agrupa productos por categorías compartidas y aplica reglas comunes.",
      href: "/settings/productos/familias",
      stat: "Sin registros aún",
      actionText: "Ver familias",
      icon: IconBox,
    },
    {
      title: "Modelos y variantes",
      description: "Registra modelos reutilizables con atributos compartidos para acelerar cotizaciones.",
      href: "/settings/productos/modelos",
      stat: "Sin registros aún",
      actionText: "Explorar modelos",
      icon: IconBuildingFactory,
    },
    {
      title: "Catálogo y precios",
      description: "Administra los productos y servicios con precios, impuestos y metadatos multitenant.",
      href: "/settings/catalogo",
      stat: `${formattedItems} ítems disponibles`,
      actionText: "Ir al catálogo",
      icon: IconPhoto,
    },
  ]
}

export default async function SettingsProductosItemsPage() {
  const items = await fetchCatalogItems({ includeInactive: true })
  const overviewCards = buildOverviewCards(items.length)

  return (
    <AppViewLayout title="Settings · Productos y servicios">
      <div className="space-y-6 px-4 py-6 lg:px-6">
        <header className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Productos y servicios
          </p>
          <h1 className="text-2xl font-semibold">Ítems del catálogo</h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Estructura las líneas, familias, modelos y productos/servicios con fotos, costos e impuestos.
            Desde aquí puedes avanzar en el flujo de creación y enlazar cada ítem con cotizaciones u otros
            recursos.
          </p>
        </header>
        <div className="grid gap-4 md:grid-cols-2">
          {overviewCards.map((card) => (
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
          ))}
        </div>
        <CatalogItemsPanel initialItems={items} />
      </div>
    </AppViewLayout>
  )
}
