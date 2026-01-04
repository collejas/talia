import { AppViewLayout } from "@/components/layouts/app-view-layout"
import {
  fetchFamiliasDeProductos,
  fetchModelosProductos,
} from "@/app/settings/productos/actions"
import { ModelosView } from "@/components/settings/productos/modelos-view"

export default async function ModelosPage() {
  const [modelos, familias] = await Promise.all([
    fetchModelosProductos({ includeInactive: true }),
    fetchFamiliasDeProductos({ includeInactive: true }),
  ])

  return (
    <AppViewLayout title="Settings · Modelos">
      <ModelosView modelos={modelos} familias={familias} />
    </AppViewLayout>
  )
}
