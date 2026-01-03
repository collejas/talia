import { AppViewLayout } from "@/components/layouts/app-view-layout"
import {
  fetchFamiliasDeProductos,
  fetchLineasDeNegocio,
} from "@/app/settings/productos/actions"
import { FamiliasView } from "@/components/settings/productos/familias-view"

export default async function FamiliasProductosPage() {
  const [lineas, familias] = await Promise.all([
    fetchLineasDeNegocio({ includeInactive: true }),
    fetchFamiliasDeProductos({ includeInactive: true }),
  ])

  return (
    <AppViewLayout title="Settings · Familias de productos">
      <FamiliasView lineas={lineas} familias={familias} />
    </AppViewLayout>
  )
}
