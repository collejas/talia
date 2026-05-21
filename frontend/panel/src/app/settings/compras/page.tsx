import Link from "next/link"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { callCrmApi } from "@/lib/api/crm"

import { createAlmacenAction, createRecepcionAction } from "./actions"

type AnyRecord = Record<string, unknown>

function asString(value: unknown, fallback = "—"): string {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length ? trimmed : fallback
  }
  if (value === null || value === undefined) {
    return fallback
  }
  return String(value)
}

function asBooleanLabel(value: unknown): string {
  return value ? "Sí" : "No"
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function formatCurrency(value: unknown, currency = "MXN"): string {
  const numberValue = asNumber(value)
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(numberValue)
  } catch {
    return `${numberValue.toFixed(2)} ${currency}`
  }
}

function formatDateTime(value: unknown): string {
  if (typeof value !== "string" || !value) return "—"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed)
}

function makeDefaultReceptionNumber(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, "0")
  return `RC-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(
    now.getMinutes(),
  )}${pad(now.getSeconds())}`
}

async function fetchList(path: string, searchParams?: Record<string, string | number | boolean | undefined>) {
  const response = await callCrmApi<AnyRecord[]>(path, {
    searchParams,
  })
  if (!response.ok || !Array.isArray(response.data)) {
    return []
  }
  return response.data
}

function buildSuggestedItems(order: AnyRecord | null | undefined): string {
  if (!order || !Array.isArray(order.items)) {
    return "[]"
  }
  const items = order.items
    .filter((item): item is AnyRecord => Boolean(item) && typeof item === "object")
    .map((item) => {
      const qtyRequested = asNumber(item.cantidad_solicitada)
      const qtyReceived = asNumber(item.cantidad_recibida)
      const remaining = Math.max(qtyRequested - qtyReceived, 0)
      const catalogItem = item.catalog_item && typeof item.catalog_item === "object" ? (item.catalog_item as AnyRecord) : {}
      return {
        orden_compra_item_id: asString(item.id, ""),
        catalog_item_id: asString(item.catalog_item_id, ""),
        cantidad_recibida: remaining || qtyRequested || 0,
        costo_unitario_real: asNumber(item.costo_unitario),
        lote_codigo: "",
        fecha_caducidad: "",
        serie: "",
        observaciones: "",
        producto: asString(catalogItem.nombre, ""),
        unidad: asString(catalogItem.unidad, "unidad"),
      }
    })
  return JSON.stringify(items, null, 2)
}

export default async function SettingsComprasPage() {
  const [almacenes, ordenes, recepciones] = await Promise.all([
    fetchList("/crm/compras/almacenes", { include_inactive: false, limit: 100 }),
    fetchList("/crm/compras/ordenes", { limit: 100 }),
    fetchList("/crm/compras/recepciones", { limit: 25 }),
  ])

  const principalWarehouse = almacenes.find((almacen) => Boolean(almacen.es_principal)) ?? almacenes[0] ?? null
  const firstOrder = ordenes[0] ?? null
  const suggestedItemsJson = buildSuggestedItems(firstOrder)
  const defaultWarehouseId = principalWarehouse ? asString(principalWarehouse.id, "") : firstOrder ? asString(firstOrder.almacen_destino_id, "") : ""
  const defaultOrderId = firstOrder ? asString(firstOrder.id, "") : ""

  return (
    <AppViewLayout title="Settings · Compras e inventario">
      <div className="space-y-6 px-4 py-6 lg:px-6">
        <header className="space-y-1">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Operación
          </p>
          <h1 className="text-2xl font-semibold">Compras e inventario</h1>
          <p className="text-sm text-muted-foreground">
            Mantén almacenes, órdenes abiertas y recepciones en un solo lugar. Esta pantalla es
            la base operativa para que el stock entre y salga de forma trazable.
          </p>
        </header>

        <div className="grid gap-4 xl:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Alta rápida de almacén</CardTitle>
              <CardDescription>Crea almacenes sin salir de la operación.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={createAlmacenAction} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="almacen-codigo">
                    Código
                  </label>
                  <Input id="almacen-codigo" name="codigo" placeholder="CENTRAL" required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="almacen-nombre">
                    Nombre
                  </label>
                  <Input id="almacen-nombre" name="nombre" placeholder="Almacén central" required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="almacen-tipo">
                    Tipo
                  </label>
                  <select
                    id="almacen-tipo"
                    name="tipo"
                    defaultValue="central"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="central">Central</option>
                    <option value="sucursal">Sucursal</option>
                    <option value="transito">Tránsito</option>
                    <option value="consignacion">Consignación</option>
                  </select>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="almacen-telefono">
                      Teléfono
                    </label>
                    <Input id="almacen-telefono" name="telefono" placeholder="55 5555 5555" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="almacen-email">
                      Email
                    </label>
                    <Input id="almacen-email" name="email" type="email" placeholder="almacen@empresa.com" />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="activo" defaultChecked />
                  Activo
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="es_principal" defaultChecked={!principalWarehouse} />
                  Principal
                </label>
                <Button type="submit" className="w-full">
                  Guardar almacén
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Registrar recepción</CardTitle>
              <CardDescription>
                Usa una orden abierta y captura las líneas recibidas en una sola transacción.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={createRecepcionAction} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="recepcion-orden">
                      Orden de compra
                    </label>
                    <select
                      id="recepcion-orden"
                      name="orden_compra_id"
                      defaultValue={defaultOrderId}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      required
                    >
                      <option value="" disabled>
                        Selecciona una orden
                      </option>
                      {ordenes.map((orden) => (
                        <option key={String(orden.id)} value={String(orden.id)}>
                          {asString(orden.folio)} · {asString((orden.proveedor as AnyRecord | undefined)?.razon_social ?? (orden.proveedor as AnyRecord | undefined)?.nombre_comercial, "Proveedor")}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="recepcion-almacen">
                      Almacén
                    </label>
                    <select
                      id="recepcion-almacen"
                      name="almacen_id"
                      defaultValue={defaultWarehouseId}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      required
                    >
                      <option value="" disabled>
                        Selecciona un almacén
                      </option>
                      {almacenes.map((almacen) => (
                        <option key={String(almacen.id)} value={String(almacen.id)}>
                          {asString(almacen.codigo)} · {asString(almacen.nombre)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="recepcion-numero">
                      Número de recepción
                    </label>
                    <Input
                      id="recepcion-numero"
                      name="numero_recepcion"
                      defaultValue={makeDefaultReceptionNumber()}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="recepcion-ref">
                      Referencia externa
                    </label>
                    <Input id="recepcion-ref" name="referencia_externa" placeholder="Factura, guía o remisión" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="recepcion-notas">
                    Observaciones
                  </label>
                  <Textarea id="recepcion-notas" name="observaciones" placeholder="Diferencias, daños, notas..." />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="recepcion-items">
                    Líneas recibidas en JSON
                  </label>
                  <Textarea
                    id="recepcion-items"
                    name="items_json"
                    className="min-h-64 font-mono text-xs"
                    defaultValue={suggestedItemsJson}
                  />
                  <p className="text-xs text-muted-foreground">
                    El formato esperado es un arreglo con `orden_compra_item_id`, `catalog_item_id`,
                    `cantidad_recibida` y `costo_unitario_real`. Puedes usar como base las líneas de la orden.
                  </p>
                </div>
                <Button type="submit">Registrar recepción</Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Almacenes</CardTitle>
              <CardDescription>Disponible para recepciones y control de stock.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Principal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!almacenes.length ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                        No hay almacenes todavía.
                      </TableCell>
                    </TableRow>
                  ) : (
                    almacenes.map((almacen) => (
                      <TableRow key={String(almacen.id)}>
                        <TableCell className="font-mono text-xs">{asString(almacen.codigo)}</TableCell>
                        <TableCell>{asString(almacen.nombre)}</TableCell>
                        <TableCell>{asString(almacen.tipo)}</TableCell>
                        <TableCell>{asBooleanLabel(almacen.es_principal)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Órdenes abiertas</CardTitle>
              <CardDescription>Fuente para capturar recepciones parciales o completas.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Folio</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!ordenes.length ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                        No hay órdenes de compra abiertas.
                      </TableCell>
                    </TableRow>
                  ) : (
                    ordenes.map((orden) => {
                      const proveedor = orden.proveedor && typeof orden.proveedor === "object" ? (orden.proveedor as AnyRecord) : {}
                      return (
                        <TableRow key={String(orden.id)}>
                          <TableCell className="font-medium">{asString(orden.folio)}</TableCell>
                          <TableCell>{asString(proveedor.razon_social ?? proveedor.nombre_comercial)}</TableCell>
                          <TableCell>{asString(orden.estado)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(orden.total, asString(orden.moneda, "MXN"))}</TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recepciones recientes</CardTitle>
            <CardDescription>Historial de ingresos de mercancía al inventario.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Orden</TableHead>
                  <TableHead>Almacén</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Recibido</TableHead>
                  <TableHead className="text-right">Ítems</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!recepciones.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                      Aún no hay recepciones registradas.
                    </TableCell>
                  </TableRow>
                ) : (
                  recepciones.map((recepcion) => {
                    const items = Array.isArray(recepcion.items) ? recepcion.items : []
                    return (
                      <TableRow key={String(recepcion.id)}>
                        <TableCell className="font-mono text-xs">{asString(recepcion.numero_recepcion)}</TableCell>
                        <TableCell>{asString((recepcion.orden_compra as AnyRecord | undefined)?.folio)}</TableCell>
                        <TableCell>{asString((recepcion.almacen as AnyRecord | undefined)?.nombre)}</TableCell>
                        <TableCell>{asString(recepcion.estado)}</TableCell>
                        <TableCell>{formatDateTime(recepcion.recibido_en)}</TableCell>
                        <TableCell className="text-right">{items.length}</TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="text-sm text-muted-foreground">
          ¿Necesitas ir al catálogo?{" "}
          <Link href="/settings/productos" className="font-medium text-primary hover:underline">
            Volver a productos y servicios
          </Link>
        </div>
      </div>
    </AppViewLayout>
  )
}
