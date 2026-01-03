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

export default async function LineasDeNegocioPage() {
  const [lineas, familias] = await Promise.all([
    fetchLineasDeNegocio({ includeInactive: true }),
    fetchFamiliasDeProductos({ includeInactive: true }),
  ])
  const familiasPorLinea = new Map<string, number>()
  for (const familia of familias) {
    if (!familia.lineaId) {
      continue
    }
    familiasPorLinea.set(familia.lineaId, (familiasPorLinea.get(familia.lineaId) ?? 0) + 1)
  }

  return (
    <AppViewLayout title="Settings · Líneas de negocio">
      <div className="space-y-6 px-4 py-6 lg:px-6">
        <header className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Productos y servicios
          </p>
          <h1 className="text-2xl font-semibold">Líneas de negocio</h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Administra las líneas estratégicas de cada organización, visualiza cuántas familias las
            acompañan y enlázalas con las siguientes capas del catálogo.
          </p>
        </header>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg">Líneas registradas</CardTitle>
                <CardDescription>
                  {lineas.length ? (
                    <>
                      {lineas.filter((linea) => linea.activo).length} activas ·{" "}
                      {lineas.length - lineas.filter((linea) => linea.activo).length} archivadas
                    </>
                  ) : (
                    "Sin líneas creadas todavía"
                  )}
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/settings/catalogo">Ir al catálogo</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {lineas.length === 0 ? (
              <div className="rounded-xl border border-dashed border-muted/60 bg-muted/5 p-6 text-sm text-muted-foreground">
                Crea tus líneas de negocio en la base de datos para agrupar familias y productos por
                segmento. Una vez creadas podrás enlazar familias, modelos y productos.
              </div>
            ) : (
              <ScrollArea className="max-h-[520px] rounded-xl bg-background p-4">
                <div className="space-y-4">
                  {lineas.map((linea) => (
                    <div
                      key={linea.id}
                      className="rounded-2xl border border-border/80 bg-card px-4 py-3 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-lg font-semibold">{linea.nombre}</p>
                          <p className="text-sm text-muted-foreground">
                            {linea.descripcion || "Sin descripción proporcionada"}
                          </p>
                        </div>
                        <Badge variant={linea.activo ? "secondary" : "outline"}>
                          {linea.activo ? "Activa" : "Archivada"}
                        </Badge>
                      </div>
                      <div className="mt-4 flex items-center justify-between gap-4">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            Familias asociadas
                          </p>
                          <p className="text-2xl font-semibold">
                            {familiasPorLinea.get(linea.id) ?? 0}
                          </p>
                        </div>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/settings/productos/familias?linea=${linea.id}`}>
                            Ver familias
                          </Link>
                        </Button>
                      </div>
                    </div>
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
