import Link from "next/link"
import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { Button } from "@/components/ui/button"
import {
  fetchFamiliasDeProductos,
  fetchLineasDeNegocio,
} from "@/app/settings/productos/actions"
import { FamiliasView } from "@/components/settings/productos/familias-view"

const RELATED_BUTTONS = [
  { href: "/settings/productos/lineas", label: "Gestionar líneas de negocio" },
  { href: "/settings/productos/modelos", label: "Gestionar modelos y variantes" },
  { href: "/settings/productos/items", label: "Gestionar productos" },
]

export default async function FamiliasProductosPage() {
  const [lineas, familias] = await Promise.all([
    fetchLineasDeNegocio({ includeInactive: true }),
    fetchFamiliasDeProductos({ includeInactive: true }),
  ])

  return (
    <AppViewLayout title="Settings · Familias de productos">
      <div className="space-y-6 px-4 py-6 lg:px-6">
        <div className="flex flex-wrap gap-3">
          {RELATED_BUTTONS.map((button) => (
            <Button key={button.href} variant="outline" size="sm" asChild>
              <Link href={button.href}>{button.label}</Link>
            </Button>
          ))}
        </div>
        <FamiliasView lineas={lineas} familias={familias} />
      </div>
    </AppViewLayout>
  )
}
