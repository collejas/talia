import Link from "next/link"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

const sampleAttributes = [
  { name: "Plantas", hint: "Niveles del prototipo (ej. 2)" },
  { name: "Estacionamiento", hint: "Número de cajones" },
  { name: "Sala/comedor", hint: "Opciones: si / no" },
  { name: "Habitaciones", hint: "Cantidad de recámaras" },
  { name: "M2 de Construcción", hint: "Número con decimales" },
  { name: "Patio de Servicio", hint: "Describe áreas de servicio" },
]

export default function SettingsProductosAyudaPage() {
  return (
    <AppViewLayout title="Settings · Ayuda para productos">
      <div className="space-y-6 px-4 py-6 lg:px-6">
        <header className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Productos y servicios
          </p>
          <h1 className="text-2xl font-semibold">Guía para productos complejos</h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            ¿Tienes productos inmobiliarios con decenas de atributos? Esta guía te ayuda a organizar
            las líneas, familias, modelos y metadata antes de llevarla al importador.
          </p>
        </header>

        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" size="sm" asChild>
            <Link href="/settings/productos/importador">Configurar importador</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/settings/productos/items">Ver ítems del catálogo</Link>
          </Button>
        </div>
        <Separator />

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Cómo está estructurado el catálogo</CardTitle>
              <CardDescription>
                Cada producto se vincula a una línea, una familia y puede tener un modelo. El importador
                espera al menos: nombre, línea y familia. El modelo es opcional.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                Las líneas agrupan estrategias generales, las familias agrupan productos dentro de esa línea
                y los modelos conservan variantes reutilizables. Los productos se crean en
                <strong> catalog_items</strong>; la descripción breve vive en <strong>descripcion_corta</strong>,
                la descripción larga vive en <strong>descripcion_larga</strong> y el precio base vive en
                <strong>precio_base</strong>; el resto de columnas va a <strong>metadata</strong>.
              </p>
              <ul className="space-y-1 pl-4 text-foreground">
                <li>• Primero define o selecciona la línea correspondiente.</li>
                <li>• Asigna cada familia a una línea existente.</li>
                <li>• Añade modelos si necesitas resumir variantes dentro de una familia.</li>
                <li>• Los productos finales combinan todos los niveles y metadata adicional.</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Datos de ejemplo</CardTitle>
              <CardDescription>
                El documento <code>docs/Cliente_inmobiliario/listado.json</code> contiene un listado real
                de fraccionamientos con metadatos recurrentes. Usa esa información para inspirar las columnas
                que necesitas en tu plantilla.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              {sampleAttributes.map((attribute) => (
                <div key={attribute.name} className="rounded-xl border border-border/80 bg-card p-3">
                  <p className="text-sm font-semibold">{attribute.name}</p>
                  <p className="text-xs text-muted-foreground">{attribute.hint}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Paso a paso para cargar inmuebles</CardTitle>
            <CardDescription>
              Sigue estos pasos antes de subir tu Excel/CSV para asegurarte de que toda la metadata queda
              estructurada correctamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide">1. Define el esquema</p>
              <p>
                En <strong>Importador guiado</strong> crea un esquema nuevo, agrega los campos que usan tus
                vendedores (habitaciones, baños, metros, amenidades) y guarda la configuración.
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide">2. Descarga la plantilla</p>
              <p>
                Usa el botón <em>Descargar plantilla CSV</em> para obtener el encabezado con: nombre,
                descripción corta, descripción larga, precio base, línea, familia, modelo y los campos
                adicionales.
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide">3. Llena el documento</p>
              <p>
                Completa cada fila siguiendo el mismo orden: el nombre del producto irá a la columna
                <strong> nombre</strong>, la descripción breve en <strong>descripcion_corta</strong>, la
                descripción larga en <strong>descripcion_larga</strong>, la línea debe existir en el catálogo,
                el precio base en <strong>precio_base</strong> y las columnas extra se convertirán en metadata.
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide">4. Importa el archivo</p>
              <p>
                Sube el archivo desde el importador. El sistema validará los campos obligatorios y te
                mostrará qué filas se crearon/actualizaron o qué errores debes corregir.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tips para vendedores sin experiencia técnica</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="space-y-2">
              <p>
                Crea un ejemplo con los productos más representativos. Si tienes modelos repetidos, utiliza
                únicamente el nombre y la línea, y deja el campo modelo en blanco cuando no aplique.
              </p>
            </div>
            <div className="space-y-2">
              <p>
                Las columnas adicionales quedan agrupadas en metadata. No uses símbolos especiales en los
                slugs y prefiere palabras sencillas como <em>habitaciones</em> o <em>banos</em>.
              </p>
            </div>
            <div className="space-y-2">
              <p>
                Si necesitas ayuda continua, comparte el archivo con tu equipo técnico para que verifiquen la
                estructura antes de subirla al importador.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppViewLayout>
  )
}
