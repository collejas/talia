import Link from "next/link"
import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { IconBuildingFactory, IconHierarchy, IconBox, IconPhoto, IconActivity, IconRulerMeasure } from "@tabler/icons-react"

const SECTIONS = [
  {
    title: "Líneas de negocio",
    description: "Define los bloques de oferta principales que maneja cada organización.",
    url: "/settings/productos/lineas",
    icon: IconHierarchy,
  },
  {
    title: "Familias de productos",
    description: "Agrupa productos por categorías o segmentos dentro de cada línea.",
    url: "/settings/productos/familias",
    icon: IconBox,
  },
  {
    title: "Modelos y variantes",
    description: "Registra modelos comunes con atributos compartidos o configuraciones estándar.",
    url: "/settings/productos/modelos",
    icon: IconBuildingFactory,
  },
  {
    title: "Productos y servicios",
    description: "Administra cada SKU con precios, costos, imágenes y metadatos específicos.",
    url: "/settings/productos/items",
    icon: IconPhoto,
  },
  {
    title: "Unidades de medida",
    description: "Define las unidades válidas para inventario y captura de productos.",
    url: "/settings/productos/unidades-medida",
    icon: IconRulerMeasure,
  },
  {
    title: "Observabilidad vectorial",
    description: "Monitorea uso de embeddings, fallback y tendencia diaria para controlar costo.",
    url: "/settings/productos/observabilidad",
    icon: IconActivity,
  },
]

export default function SettingsProductosPage() {
  return (
    <AppViewLayout title="Settings · Productos y servicios">
      <div className="space-y-6 px-4 py-6 lg:px-6">
        <header className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Configuración
          </p>
          <h1 className="text-2xl font-semibold">Productos y servicios</h1>
          <p className="text-sm text-muted-foreground">
            Organiza tus líneas, familias, modelos y productos con contexto multitenant antes de
            poblarlos con precios, medios o cotizaciones.
          </p>
        </header>
        <div className="grid gap-4 md:grid-cols-2">
          {SECTIONS.map((section) => (
            <Card key={section.title} className="flex flex-col justify-between">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <section.icon className="h-4 w-4 text-primary" />
                  {section.title}
                </CardTitle>
                <p className="text-sm text-muted-foreground">{section.description}</p>
              </CardHeader>
              <CardContent>
                <Button asChild size="sm">
                  <Link href={section.url}>Gestionar</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppViewLayout>
  )
}
