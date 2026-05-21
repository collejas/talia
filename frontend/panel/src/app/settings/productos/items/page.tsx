import Link from "next/link"
import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { CatalogItemsPanel } from "@/components/settings/catalog-items-panel"
import { fetchCatalogItems } from "@/app/settings/catalogo/actions"
import {
  fetchFamiliasDeProductos,
  fetchLineasDeNegocio,
  fetchModelosProductos,
  fetchUnidadesMedida,
} from "@/app/settings/productos/actions"

export default async function SettingsProductosItemsPage() {
  const [items, lineas, familias, modelos, unidadesMedida] = await Promise.all([
    fetchCatalogItems({ includeInactive: true }),
    fetchLineasDeNegocio({ includeInactive: true }),
    fetchFamiliasDeProductos({ includeInactive: true }),
    fetchModelosProductos({ includeInactive: true }),
    fetchUnidadesMedida({ includeInactive: true }),
  ])
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
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings/productos/lineas">Gestionar líneas de negocio</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings/productos/familias">Gestionar familias de productos</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings/productos/modelos">Gestionar modelos y variantes</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/settings/productos/ayuda">Guía para productos complejos</Link>
          </Button>
          <Button variant="secondary" size="sm" asChild>
            <Link href="/settings/productos/importador">Configurar importador</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings/productos/unidades-medida">Unidades de medida</Link>
          </Button>
        </div>
        <Separator />
        <CatalogItemsPanel
          initialItems={items}
          lineas={lineas}
          familias={familias}
          modelos={modelos}
          unidadesMedida={unidadesMedida}
        />
      </div>
    </AppViewLayout>
  )
}
