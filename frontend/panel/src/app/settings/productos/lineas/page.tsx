import { AppViewLayout } from "@/components/layouts/app-view-layout"
import {
  fetchFamiliasDeProductos,
  fetchLineasDeNegocio,
} from "@/app/settings/productos/actions"
import { LineasView } from "@/components/settings/productos/lineas-view"

export default async function LineasDeNegocioPage() {
  const [lineas, familias] = await Promise.all([
    fetchLineasDeNegocio({ includeInactive: true }),
    fetchFamiliasDeProductos({ includeInactive: true }),
  ])

  return (
    <AppViewLayout title="Settings · Líneas de negocio">
      <LineasView lineas={lineas} familias={familias} />
    </AppViewLayout>
  )
}
