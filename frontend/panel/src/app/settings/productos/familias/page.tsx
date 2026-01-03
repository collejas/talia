import Link from "next/link"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  fetchFamiliasDeProductos,
  fetchLineasDeNegocio,
} from "@/app/settings/productos/actions"

export default async function FamiliasProductosPage() {
  const [lineas, familias] = await Promise.all([
    fetchLineasDeNegocio({ includeInactive: true }),
    fetchFamiliasDeProductos({ includeInactive: true }),
  ])
  const lineaMap = new Map(lineas.map((linea) => [linea.id, linea.nombre]))

  return (
    <AppViewLayout title="Settings · Familias de productos">
      <div className="space-y-6 px-4 py-6 lg:px-6">
        <header className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Productos y servicios
          </p>
          <h1 className="text-2xl font-semibold">Familias de productos</h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Agrupa productos dentro de cada línea para aplicar reglas compartidas y facilitar
            cotizaciones escalables.
          </p>
        </header>
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg">Familias registradas</CardTitle>
                <CardDescription>
                  {familias.length ? (
                    <>
                      {familias.filter((familia) => familia.activo).length} activas ·{" "}
                      {familias.length - familias.filter((familia) => familia.activo).length}{" "}
                      archivadas
                    </>
                  ) : (
                    "Todavía no hay familias configuradas"
                  )}
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/settings/productos/lineas">Ver líneas</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {familias.length === 0 ? (
              <div className="rounded-xl border border-dashed border-muted/60 bg-muted/5 p-6 text-sm text-muted-foreground">
                Una vez que exista al menos una línea de negocio podrás crear familias y vincular
                productos. Usa el menú izquierdo para iniciar con las líneas.
              </div>
            ) : (
              <ScrollArea className="max-h-[600px] rounded-xl bg-background p-4">
                <div className="space-y-4">
                  {familias.map((familia) => (
                    <Card key={familia.id}>
                      <CardHeader>
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <CardTitle className="text-lg">{familia.nombre}</CardTitle>
                            <CardDescription>
                              {familia.descripcion ?? "Sin descripción disponible"}
                            </CardDescription>
                          </div>
                          <Badge variant="outline">
                            {lineaMap.get(familia.lineaId ?? "") ?? "Sin línea asociada"}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Estado</p>
                          <p className="text-base font-medium">
                            {familia.activo ? "Activa" : "Archivada"}
                          </p>
                        </div>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href="/settings/productos/modelos">Ver modelos</Link>
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
