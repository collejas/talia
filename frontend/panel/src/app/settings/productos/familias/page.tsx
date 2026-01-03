"use client"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const mockFamilies = [
  {
    id: "f-1",
    nombre: "Instalaciones eléctricas",
    linea: "Soluciones industriales",
    descripcion: "Enlaces de alto voltaje, pruebas termográficas y puesta en marcha.",
    productos: 18,
  },
  {
    id: "f-2",
    nombre: "Plataformas cloud",
    linea: "Servicios digitales",
    descripcion: "Licencias, consultoría y soporte continuo para soluciones cloud.",
    productos: 27,
  },
]

export default function FamiliasProductosPage() {
  return (
    <AppViewLayout title="Settings · Familias de productos">
      <div className="space-y-6 px-4 py-6 lg:px-6">
        <header className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Productos y servicios
          </p>
          <h1 className="text-2xl font-semibold">Familias de productos</h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Agrupa productos dentro de cada línea de negocio para facilitar cotizaciones y establecer
            reglas compartidas.
          </p>
        </header>
        <ScrollArea className="max-h-[600px] rounded-xl border bg-background p-4">
          <div className="space-y-4">
            {mockFamilies.map((familia) => (
              <Card key={familia.id}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <CardTitle className="text-lg">{familia.nombre}</CardTitle>
                      <CardDescription>{familia.descripcion}</CardDescription>
                    </div>
                    <Badge variant="outline">{familia.productos} productos</Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex items-center gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Línea</p>
                    <p className="text-base font-medium">{familia.linea}</p>
                  </div>
                  <Button variant="secondary" size="sm">
                    Ver modelos
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
