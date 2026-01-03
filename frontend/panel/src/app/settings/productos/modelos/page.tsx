"use client"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

const mockModels = [
  {
    id: "m-1",
    nombre: "Modelo 5G Compact",
    linea: "Soluciones industriales",
    descripcion: "Modelo homologado con sensores inteligentes y garantía extendida.",
    familias: 2,
  },
  {
    id: "m-2",
    nombre: "Stack Cloud Enterprise",
    linea: "Servicios digitales",
    descripcion: "Paquete de plataformas administradas con soporte 24/7.",
    familias: 3,
  },
]

export default function ModelosPage() {
  return (
    <AppViewLayout title="Settings · Modelos">
      <div className="space-y-6 px-4 py-6 lg:px-6">
        <header className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Productos y servicios
          </p>
          <h1 className="text-2xl font-semibold">Modelos y variantes</h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Estandariza los atributos comunes para acelerar cotizaciones y mantener consistencia
            entre productos relacionados.
          </p>
        </header>
        <ScrollArea className="max-h-[600px] rounded-xl border bg-background p-4">
          <div className="space-y-4">
            {mockModels.map((modelo) => (
              <Card key={modelo.id}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <CardTitle className="text-lg">{modelo.nombre}</CardTitle>
                      <CardDescription>{modelo.descripcion}</CardDescription>
                    </div>
                    <Badge variant="outline">{modelo.familias} familias</Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Línea</p>
                    <p className="text-base font-medium">{modelo.linea}</p>
                  </div>
                  <Button variant="secondary" size="sm">
                    Ver productos derivados
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </div>
    </AppViewLayout>
  )
}
