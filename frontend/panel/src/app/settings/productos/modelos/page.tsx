import Link from "next/link"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardDescription,
  CardTitle,
} from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { fetchModelosProductos } from "@/app/settings/productos/actions"

const formatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
})

function formatDate(value: string): string {
  const parsed = value ? new Date(value) : null
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return "—"
  }
  return formatter.format(parsed)
}

export default async function ModelosPage() {
  const modelos = await fetchModelosProductos({ includeInactive: true })

  return (
    <AppViewLayout title="Settings · Modelos">
      <div className="space-y-6 px-4 py-6 lg:px-6">
        <header className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Productos y servicios
          </p>
          <h1 className="text-2xl font-semibold">Modelos y variantes</h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Estandariza los atributos comunes de tus productos para acelerar cotizaciones y mantener
            consistencia entre los ítems relacionados.
          </p>
        </header>
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg">Modelos definidos</CardTitle>
                <CardDescription>
                  {modelos.length
                    ? `${modelos.length} modelos registrados`
                    : "No hay modelos configurados aún"}
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/settings/catalogo">Revisar catálogo</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {modelos.length === 0 ? (
              <div className="rounded-xl border border-dashed border-muted/60 bg-muted/5 p-6 text-sm text-muted-foreground">
                Crea variantes que compartan atributos comunes y únelas a familias o productos desde el
                catálogo.
              </div>
            ) : (
              <ScrollArea className="max-h-[600px] rounded-xl bg-background p-4">
                <div className="space-y-4">
                  {modelos.map((modelo) => (
                    <Card key={modelo.id}>
                      <CardHeader>
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <CardTitle className="text-lg">{modelo.nombre}</CardTitle>
                            <CardDescription>
                              {modelo.descripcion ?? "Sin descripción disponible"}
                            </CardDescription>
                          </div>
                          <Badge variant={modelo.activo ? "secondary" : "outline"}>
                            {modelo.activo ? "Activo" : "Archivado"}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Actualizado</p>
                          <p className="text-base font-medium">
                            {formatDate(modelo.actualizadoEn)}
                          </p>
                        </div>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href="/settings/productos/items">Ver ítems</Link>
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </AppViewLayout>
  )
}
