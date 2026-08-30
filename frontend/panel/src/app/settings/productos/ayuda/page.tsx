import Link from "next/link"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

const requiredFields = [
  ["codigo", "Identificador estable del producto. No debe cambiar cuando cambie el nombre."],
  ["nombre", "Nombre visible del producto."],
  ["linea", "Línea a la que pertenece el producto."],
  ["familia", "Familia dentro de la línea."],
]

const recommendedFields = [
  ["linea_codigo", "Evita crear otra línea cuando cambie su nombre."],
  ["familia_codigo", "Evita crear otra familia cuando cambie su nombre."],
  ["modelo_codigo", "Evita crear otro modelo cuando cambie su nombre."],
]

const optionalFields = [
  "modelo", "slug", "tipo", "descripcion", "descripcion_corta", "descripcion_larga", "unidad",
  "precio_base", "moneda", "impuestos", "activo", "requiere_factura", "clave_sat", "unidad_sat",
  "metadatos", "maneja_inventario", "unidad_inventario", "stock_minimo", "stock_objetivo", "costo_ultimo",
  "costo_promedio", "requiere_lote", "requiere_serie", "proveedor_principal_id", "activo_compra",
  "linea_descripcion", "familia_descripcion", "modelo_descripcion",
]

const minimalCsv = `codigo,nombre,linea,familia\nPROD-001,Producto ejemplo,Operación,Familia estándar`

const updateCsv = `codigo,nombre,descripcion_corta,precio_base,linea_codigo,linea,familia_codigo,familia,modelo_codigo,modelo\nPROD-001,Producto actualizado,Descripción nueva,1500,LIN-001,Operación,FAM-001,Familia estándar,MOD-001,Modelo base`

const newCsv = `codigo,nombre,linea_codigo,linea,familia_codigo,familia,modelo_codigo,modelo\nPROD-002,Producto nuevo,LIN-001,Operación,FAM-002,Familia nueva,MOD-002,Modelo nuevo`

export default function SettingsProductosAyudaPage() {
  return (
    <AppViewLayout title="Settings · Ayuda para productos">
      <div className="space-y-6 px-4 py-6 lg:px-6">
        <header className="space-y-1">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Productos y servicios</p>
          <h1 className="text-2xl font-semibold">Guía para importar productos</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Usa esta guía para preparar un CSV o Excel que cree productos nuevos o actualice productos existentes
            sin duplicarlos.
          </p>
        </header>

        <div className="flex flex-wrap gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings/productos">Volver a Productos</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/settings/productos/items">Ver productos</Link>
          </Button>
        </div>
        <Separator />

        <Card>
          <CardHeader>
            <CardTitle>Regla principal: el código identifica el registro</CardTitle>
            <CardDescription>
              El sistema busca cada producto por organización y <strong>código</strong>, no por nombre.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Si vuelves a subir <strong>PROD-001</strong>, se actualiza el mismo producto aunque cambien su nombre,
              descripción, precio o jerarquía. Si cambias el código, el sistema lo interpreta como un producto nuevo.
            </p>
            <p>
              Los códigos se normalizan en mayúsculas. Por ejemplo, <strong>prod-001</strong> y
              <strong> PROD-001</strong> representan el mismo código estable.
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Campos obligatorios</CardTitle>
              <CardDescription>Si falta alguno, esa fila se rechaza.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {requiredFields.map(([field, description]) => (
                <div key={field} className="rounded-lg border border-border/80 p-3">
                  <code className="text-sm font-semibold">{field}</code>
                  <p className="mt-1 text-xs text-muted-foreground">{description}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Campos recomendados</CardTitle>
              <CardDescription>Son necesarios para renombrar la jerarquía con seguridad.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {recommendedFields.map(([field, description]) => (
                <div key={field} className="rounded-lg border border-border/80 p-3">
                  <code className="text-sm font-semibold">{field}</code>
                  <p className="mt-1 text-xs text-muted-foreground">{description}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Campos opcionales</CardTitle>
              <CardDescription>Se pueden omitir si no se necesitan.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {optionalFields.map((field) => (
                  <code key={field} className="rounded bg-muted px-2 py-1 text-xs">{field}</code>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>¿Tengo que incluir todas las columnas?</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>No. Puedes subir únicamente las columnas obligatorias:</p>
            <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-xs text-foreground">{minimalCsv}</pre>
            <ul className="list-disc space-y-1 pl-5">
              <li>Una columna opcional puede omitirse completamente o dejarse vacía.</li>
              <li>Si se omite durante una actualización, el valor existente se conserva.</li>
              <li>En un producto nuevo se aplican los valores predeterminados de la base de datos.</li>
            </ul>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Ejemplo: actualizar un producto</CardTitle>
              <CardDescription>Conserva el mismo código para modificar el registro existente.</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-xs text-foreground">{updateCsv}</pre>
              <p className="mt-3 text-sm text-muted-foreground">Esta fila actualiza <strong>PROD-001</strong>; no crea otro producto.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ejemplo: crear un producto</CardTitle>
              <CardDescription>Usa un código que todavía no exista dentro del tenant.</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-xs text-foreground">{newCsv}</pre>
              <p className="mt-3 text-sm text-muted-foreground">
                Si la línea, familia o modelo no existen, el importador puede crearlos usando los nombres y códigos proporcionados.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Lo que sí puede hacer</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <ul className="list-disc space-y-2 pl-5">
                <li>Crear productos con un código nuevo.</li>
                <li>Actualizar productos conservando su código.</li>
                <li>Cambiar nombres y descripciones sin duplicar registros.</li>
                <li>Actualizar precios, costos, estados, inventario y datos fiscales.</li>
                <li>Actualizar la jerarquía usando sus códigos estables.</li>
                <li>Subir CSV, XLSX o XLS.</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Lo que no debe hacer</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <ul className="list-disc space-y-2 pl-5">
                <li>No cambies el código de un producto si quieres actualizarlo.</li>
                <li>No uses el nombre como identificador único.</li>
                <li>No asignes una familia a una línea distinta.</li>
                <li>No asignes un modelo a una familia distinta.</li>
                <li>No reutilices el mismo código para dos productos diferentes.</li>
                <li>Los campos JSON como <code>impuestos</code> y <code>metadatos</code> deben tener JSON válido.</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Proceso recomendado</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <ol className="list-decimal space-y-2 pl-5">
              <li>Desde <strong>settings/productos</strong>, descarga la plantilla.</li>
              <li>Conserva los códigos estables de productos y jerarquías.</li>
              <li>Completa solo las columnas que necesitas modificar.</li>
              <li>Sube el archivo desde la sección de carga masiva.</li>
              <li>Revisa el resumen de filas creadas, actualizadas y rechazadas.</li>
              <li>Descarga nuevamente el catálogo para verificar el resultado.</li>
            </ol>
            <p>
              Las filas con error no cancelan toda la carga. Corrige esas filas y vuelve a subirlas conservando sus códigos estables.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppViewLayout>
  )
}
