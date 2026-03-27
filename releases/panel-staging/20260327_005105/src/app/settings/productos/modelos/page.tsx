import Link from "next/link"
import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { Button } from "@/components/ui/button"
import {
  fetchFamiliasDeProductos,
  fetchLineasDeNegocio,
  fetchModelosProductos,
} from "@/app/settings/productos/actions"
import { ModelosView } from "@/components/settings/productos/modelos-view"

const RELATED_BUTTONS = [
  { href: "/settings/productos/lineas", label: "Gestionar líneas de negocio" },
  { href: "/settings/productos/familias", label: "Gestionar familias de productos" },
  { href: "/settings/productos/items", label: "Gestionar productos" },
]

export default async function ModelosPage() {
  const [modelos, familias, lineas] = await Promise.all([
    fetchModelosProductos({ includeInactive: true }),
    fetchFamiliasDeProductos({ includeInactive: true }),
    fetchLineasDeNegocio({ includeInactive: true }),
  ])

  return (
    <AppViewLayout title="Settings · Modelos">
      <div className="space-y-6 px-4 py-6 lg:px-6">
        <div className="flex flex-wrap gap-3">
          {RELATED_BUTTONS.map((button) => (
            <Button key={button.href} variant="outline" size="sm" asChild>
              <Link href={button.href}>{button.label}</Link>
            </Button>
          ))}
        </div>
        <ModelosView modelos={modelos} familias={familias} lineas={lineas} />
      </div>
    </AppViewLayout>
  )
}
