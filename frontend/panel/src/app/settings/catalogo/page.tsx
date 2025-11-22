import type { Metadata } from "next"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { CatalogItemsPanel } from "@/components/settings/catalog-items-panel"

import { fetchCatalogItems } from "./actions"

export const metadata: Metadata = {
  title: "Catálogo de productos",
}

export default async function CatalogSettingsPage() {
  const items = await fetchCatalogItems({ includeInactive: true })

  return (
    <AppViewLayout title="Settings · Catálogo">
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        <header className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Configuración
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Catálogo de productos y servicios
          </h1>
          <p className="text-muted-foreground max-w-3xl text-sm">
            Administra los productos, servicios o paquetes disponibles para tus cotizaciones. Puedes crear,
            editar, archivar o eliminar elementos y mantener el inventario sincronizado con lo que ofreces a tus clientes.
          </p>
        </header>
        <CatalogItemsPanel initialItems={items} />
      </div>
    </AppViewLayout>
  )
}
