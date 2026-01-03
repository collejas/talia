"use client"
import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"

const mockLines = [
  {
    id: "1",
    nombre: "Soluciones industriales",
    descripcion: "Paquetes de automatización y mantenimiento en planta.",
    productos: 48,
  },
  {
    id: "2",
    nombre: "Servicios digitales",
    descripcion: "Consultoría, estrategia y despliegue de plataformas en la nube.",
    productos: 32,
  },
]

export default function LineasDeNegocioPage() {
  return (
    <AppViewLayout title="Settings · Líneas de negocio">
      <div className="space-y-6 px-4 py-6 lg:px-6">
        <header className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Productos y servicios
          </p>
          <h1 className="text-2xl font-semibold">Líneas de negocio</h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Define las líneas estratégicas de cada organización y enlázalas a las familias y productos.
          </p>
        </header>
        <Card>
            <CardHeader>
              <CardTitle>Líneas activas</CardTitle>
              <CardDescription>Los clientes pueden agregar nuevas líneas y relacionarlas con familias.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[320px] w-full rounded-md border bg-background">
              <div className="space-y-4 divide-y">
                {mockLines.map((linea) => (
                  <div key={linea.id} className="flex items-start justify-between gap-4 p-4">
                    <div className="space-y-1">
                      <p className="text-base font-semibold">{linea.nombre}</p>
                      <p className="text-sm text-muted-foreground">{linea.descripcion}</p>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <p>{linea.productos} productos</p>
                      <Button variant="secondary" size="sm">
                        Ver familias
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </AppViewLayout>
  )
}
