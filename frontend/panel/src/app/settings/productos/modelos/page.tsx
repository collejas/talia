import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { fetchModelosProductos } from "@/app/settings/productos/actions"
import { ModelosView } from "@/components/settings/productos/modelos-view"

export default async function ModelosPage() {
  const modelos = await fetchModelosProductos({ includeInactive: true })

  return (
    <AppViewLayout title="Settings · Modelos">
      <ModelosView modelos={modelos} />
    </AppViewLayout>
  )
}
