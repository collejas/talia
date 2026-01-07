import Link from "next/link"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

const SAMPLE_METADATA = `{
  "fraccionamiento": "Residencial Altamar",
  "prototipo": "Arena",
  "habitaciones": "3",
  "banos": "2.5",
  "m2_construccion": "162.5",
  "amenidades": {
    "smartHouseKit": true,
    "tinaco": true,
    "area_jardin": true
  }
}`

export default function SettingsProductosAyudaPage() {
  return (
    <AppViewLayout title="Settings · Ayuda de productos">
      <div className="space-y-6 px-4 py-6 lg:px-6">
        <header className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Productos y servicios
          </p>
          <h1 className="text-2xl font-semibold">Guía para cargar productos inmobiliarios</h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Sigue estos pasos para transformar cualquier dato de fraccionamiento en un producto de{" "}
            <span className="font-semibold">catalog_items</span> y que el asistente pueda responder
            preguntas específicas sobre viviendas.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>1. Reúne la información</CardTitle>
            <CardDescription>
              Usa los documentos en <code>docs/Cliente_inmobiliario</code> (índice, JSON, resumen) como
              fuente primaria. Cada fila del JSON es un prototipo distinto.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Copia nombre de fraccionamiento, prototipo, números de plantas, áreas, cantidades de
              baños, amenidades destacadas (tinaco, cisterna, Smart House Kit, rooftop, terraza, etc.)
              y cualquier observación relevante.
            </p>
            <p>
              Guarda esos datos en el campo <code>metadatos</code> de la ficha de producto para que el
              asistente pueda consultarlos fácilmente.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Usa este esquema sugerido</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Guarda los detalles en JSON estructurado. Por ejemplo:
            </p>
            <pre className="rounded-md border border-border bg-muted/50 p-3 text-xs leading-relaxed">
              {SAMPLE_METADATA}
            </pre>
            <p className="text-sm text-muted-foreground">
              Ajusta los nombres de propiedades a tus necesidades (Ej. <code>habitaciones</code>,
              <code>banos</code>, <code>m2_terreno</code>, <code>amenidades.smartHouseKit</code>).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>3. Carga el producto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Ve a <Link className="font-semibold text-primary" href="/settings/productos/items">Ítems del catálogo</Link> y crea o edita
              un registro. Rellena los campos básicos y pega tu JSON en el campo “Metadatos”.
            </p>
            <p>
              Si necesitas varias variantes (e.g. “Arena”, “Bahía”), crea un ítem por prototipo y usa
              el nombre + resumen del fraccionamiento para diferenciarlos.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>4. Verifica que el asistente lo vea</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Reindexa el catálogo desde el backend si hay un botón o simplemente espera a que el
              proceso programado lo capte. Luego pregunta al asistente por el prototipo y confirma que
              responde con los detalles del JSON.
            </p>
            <p className="text-xs text-muted-foreground">
              Si necesitas ayuda adicional, copia este texto en un ticket interno o en Slack y se lo
              compartimos al equipo técnico para replicar el flujo.
            </p>
          </CardContent>
        </Card>

        <Separator />
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" asChild>
            <Link href="/settings/productos/items">Ir a ítems del catálogo</Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Consulta los documentos en <code>docs/Cliente_inmobiliario</code> para tener ejemplos y el JSON original.
        </p>
      </div>
    </AppViewLayout>
  )
}
