import { AppViewLayout } from "@/components/layouts/app-view-layout"

import { fetchUnidadesMedida } from "@/app/settings/productos/actions"
import { UnidadesMedidaView } from "@/components/settings/productos/unidades-medida-view"

export default async function SettingsProductosUnidadesMedidaPage() {
  const unidades = await fetchUnidadesMedida({ includeInactive: true })

  return (
    <AppViewLayout title="Settings · Productos y servicios">
      <div className="space-y-6 px-4 py-6 lg:px-6">
        <header className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Productos y servicios
          </p>
          <h1 className="text-2xl font-semibold">Unidades de medida</h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Define las unidades que usarán los productos e inventario. Estas opciones aparecen en el
            select del catálogo para que no se capture texto libre.
          </p>
        </header>
        <UnidadesMedidaView initialUnits={unidades} />
      </div>
    </AppViewLayout>
  )
}
