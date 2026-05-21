"use client"

import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import { createAlmacenAction, createRecepcionAction } from "./actions"

type AnyRecord = Record<string, unknown>

type ComprasWorkspaceProps = {
  almacenes: AnyRecord[]
  ordenes: AnyRecord[]
  recepciones: AnyRecord[]
  existencias: AnyRecord[]
  defaultOrderId: string
  defaultWarehouseId: string
  defaultReceptionNumber: string
}

type ReceptionLine = {
  orden_compra_item_id: string
  catalog_item_id: string
  nombre: string
  unidad: string
  cantidad_solicitada: number
  cantidad_recibida: number
  costo_unitario_real: number
  lote_codigo: string
  fecha_caducidad: string
  serie: string
  observaciones: string
}

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

function buildLinesFromOrder(order: AnyRecord | undefined | null): ReceptionLine[] {
  if (!order || !Array.isArray(order.items)) return []
  return order.items
    .filter((item): item is AnyRecord => Boolean(item) && typeof item === "object")
    .map((item) => {
      const catalogItem = item.catalog_item && typeof item.catalog_item === "object" ? (item.catalog_item as AnyRecord) : {}
      const qtyRequested = asNumber(item.cantidad_solicitada)
      const qtyReceived = asNumber(item.cantidad_recibida)
      const pending = Math.max(qtyRequested - qtyReceived, 0)
      return {
        orden_compra_item_id: asString(item.id, ""),
        catalog_item_id: asString(item.catalog_item_id, ""),
        nombre: asString(catalogItem.nombre, "Producto"),
        unidad: asString(catalogItem.unidad, "unidad"),
        cantidad_solicitada: qtyRequested,
        cantidad_recibida: pending || qtyRequested,
        costo_unitario_real: asNumber(item.costo_unitario),
        lote_codigo: "",
        fecha_caducidad: "",
        serie: "",
        observaciones: "",
      }
    })
}

function createSuggestedReceptionNumber(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `RC-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(
    now.getMinutes(),
  )}${pad(now.getSeconds())}`
}

export function ComprasWorkspace({
  almacenes,
  ordenes,
  recepciones,
  existencias,
  defaultOrderId,
  defaultWarehouseId,
  defaultReceptionNumber,
}: ComprasWorkspaceProps) {
  const initialOrder = useMemo(
    () => ordenes.find((orden) => String(orden.id) === defaultOrderId) ?? ordenes[0] ?? null,
    [defaultOrderId, ordenes],
  )
  const [selectedOrderId, setSelectedOrderId] = useState<string>(String(initialOrder?.id ?? ""))
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(defaultWarehouseId)
  const [lines, setLines] = useState<ReceptionLine[]>(() => buildLinesFromOrder(initialOrder))
  const [receptionNumber, setReceptionNumber] = useState<string>(defaultReceptionNumber || createSuggestedReceptionNumber())
  const [referenceExternal, setReferenceExternal] = useState("")
  const [observations, setObservations] = useState("")
  const [warehouseFormCode, setWarehouseFormCode] = useState("")
  const [warehouseFormName, setWarehouseFormName] = useState("")
  const [warehouseFormType, setWarehouseFormType] = useState<"central" | "sucursal" | "transito" | "consignacion">("central")
  const [warehouseFormPhone, setWarehouseFormPhone] = useState("")
  const [warehouseFormEmail, setWarehouseFormEmail] = useState("")
  const [warehouseFormActive, setWarehouseFormActive] = useState(true)
  const [warehouseFormPrincipal, setWarehouseFormPrincipal] = useState(!almacenes.length)
  const [selectedExistenceWarehouseId, setSelectedExistenceWarehouseId] = useState<string>(defaultWarehouseId)

  useEffect(() => {
    const currentOrder = ordenes.find((orden) => String(orden.id) === selectedOrderId) ?? null
    setLines(buildLinesFromOrder(currentOrder))
    setSelectedWarehouseId((currentOrder?.almacen_destino_id as string | undefined) || defaultWarehouseId)
  }, [defaultWarehouseId, ordenes, selectedOrderId])

  const selectedOrder = ordenes.find((orden) => String(orden.id) === selectedOrderId) ?? null
  const selectedProvider = selectedOrder && typeof selectedOrder.proveedor === "object" ? (selectedOrder.proveedor as AnyRecord) : null

  const totalReceived = lines.reduce((sum, line) => sum + (Number.isFinite(line.cantidad_recibida) ? line.cantidad_recibida : 0), 0)
  const totalValue = lines.reduce((sum, line) => sum + (Number.isFinite(line.cantidad_recibida) ? line.cantidad_recibida : 0) * (Number.isFinite(line.costo_unitario_real) ? line.costo_unitario_real : 0), 0)
  const filteredExistencias = useMemo(() => {
    if (!selectedExistenceWarehouseId) {
      return existencias
    }
    return existencias.filter((existencia) => String(existencia.almacen_id) === selectedExistenceWarehouseId)
  }, [existencias, selectedExistenceWarehouseId])
  const totalStockActual = useMemo(
    () => filteredExistencias.reduce((sum, row) => sum + asNumber(row.stock_actual), 0),
    [filteredExistencias],
  )
  const totalStockDisponible = useMemo(
    () => filteredExistencias.reduce((sum, row) => sum + asNumber(row.stock_disponible), 0),
    [filteredExistencias],
  )
  const alertasStock = useMemo(
    () =>
      filteredExistencias.filter((row) => {
        const minimo = asNumber(row.stock_minimo)
        if (!Number.isFinite(minimo) || minimo <= 0) {
          return false
        }
        return asNumber(row.stock_disponible) <= minimo
      }).length,
    [filteredExistencias],
  )

  const updateLine = (index: number, patch: Partial<ReceptionLine>) => {
    setLines((current) =>
      current.map((line, currentIndex) => (currentIndex === index ? { ...line, ...patch } : line)),
    )
  }

  const fillRemaining = () => {
    setLines((current) =>
      current.map((line) => ({
        ...line,
        cantidad_recibida: Math.max(line.cantidad_solicitada, 0),
      })),
    )
  }

  const fillPending = () => {
    setLines((current) =>
      current.map((line) => {
        const pending = Math.max(line.cantidad_solicitada - line.cantidad_recibida, 0)
        return {
          ...line,
          cantidad_recibida: pending || line.cantidad_solicitada,
        }
      }),
    )
  }

  const getLineStatus = (line: ReceptionLine) => {
    const received = Math.max(line.cantidad_recibida || 0, 0)
    const requested = Math.max(line.cantidad_solicitada || 0, 0)
    if (received <= 0) {
      return {
        label: "Pendiente",
        className: "border-amber-200 bg-amber-50 text-amber-700",
      }
    }
    if (received >= requested) {
      return {
        label: "Completo",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      }
    }
    return {
      label: "Parcial",
      className: "border-sky-200 bg-sky-50 text-sky-700",
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Alta rápida de almacén</CardTitle>
          <CardDescription>Crea un almacén con datos simples y claros.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createAlmacenAction} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="almacen-codigo">
                Código
              </label>
              <Input
                id="almacen-codigo"
                name="codigo"
                placeholder="CENTRAL"
                required
                value={warehouseFormCode}
                onChange={(event) => setWarehouseFormCode(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="almacen-nombre">
                Nombre
              </label>
              <Input
                id="almacen-nombre"
                name="nombre"
                placeholder="Almacén central"
                required
                value={warehouseFormName}
                onChange={(event) => setWarehouseFormName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="almacen-tipo">
                Tipo
              </label>
              <select
                id="almacen-tipo"
                name="tipo"
                value={warehouseFormType}
                onChange={(event) => setWarehouseFormType(event.target.value as typeof warehouseFormType)}
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
                <Input
                  id="almacen-telefono"
                  name="telefono"
                  placeholder="55 5555 5555"
                  value={warehouseFormPhone}
                  onChange={(event) => setWarehouseFormPhone(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="almacen-email">
                  Email
                </label>
                <Input
                  id="almacen-email"
                  name="email"
                  type="email"
                  placeholder="almacen@empresa.com"
                  value={warehouseFormEmail}
                  onChange={(event) => setWarehouseFormEmail(event.target.value)}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="activo"
                checked={warehouseFormActive}
                onChange={(event) => setWarehouseFormActive(event.target.checked)}
              />
              Activo
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="es_principal"
                checked={warehouseFormPrincipal}
                onChange={(event) => setWarehouseFormPrincipal(event.target.checked)}
              />
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
            El operador selecciona una orden y ajusta cantidades. No ve JSON ni estructuras técnicas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createRecepcionAction} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="recepcion-orden">
                  Orden de compra
                </label>
                <select
                  id="recepcion-orden"
                  name="orden_compra_id"
                  value={selectedOrderId}
                  onChange={(event) => setSelectedOrderId(event.target.value)}
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
                {selectedProvider ? (
                  <p className="text-xs text-muted-foreground">
                    Proveedor: <span className="font-medium text-foreground">{asString(selectedProvider.razon_social ?? selectedProvider.nombre_comercial)}</span>
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="recepcion-almacen">
                  Almacén
                </label>
                <select
                  id="recepcion-almacen"
                  name="almacen_id"
                  value={selectedWarehouseId}
                  onChange={(event) => setSelectedWarehouseId(event.target.value)}
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

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="recepcion-numero">
                  Número de recepción
                </label>
                <Input
                  id="recepcion-numero"
                  name="numero_recepcion"
                  value={receptionNumber}
                  onChange={(event) => setReceptionNumber(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="recepcion-ref">
                  Referencia externa
                </label>
                <Input
                  id="recepcion-ref"
                  name="referencia_externa"
                  placeholder="Factura, guía o remisión"
                  value={referenceExternal}
                  onChange={(event) => setReferenceExternal(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="recepcion-notas">
                  Observaciones
                </label>
                <Input
                  id="recepcion-notas"
                  name="observaciones"
                  placeholder="Diferencias, daños, notas..."
                  value={observations}
                  onChange={(event) => setObservations(event.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" onClick={fillPending}>
                Completar pendientes
              </Button>
              <Button type="button" variant="outline" onClick={fillRemaining}>
                Poner todo completo
              </Button>
              <div className="ml-auto text-sm text-muted-foreground">
                {lines.length} líneas · {totalReceived.toFixed(3)} unidades · {formatCurrency(totalValue)}
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Solicitado</TableHead>
                    <TableHead>Recibido</TableHead>
                    <TableHead>Costo</TableHead>
                    <TableHead>Lote / Serie</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!lines.length ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                        Selecciona una orden para cargar sus productos.
                      </TableCell>
                    </TableRow>
                  ) : (
                    lines.map((line, index) => (
                      <TableRow
                        key={`${line.orden_compra_item_id}-${index}`}
                        className={getLineStatus(line).label === "Completo" ? "bg-emerald-50/40" : undefined}
                      >
                        <TableCell className="min-w-56">
                          <div className="space-y-1">
                            <div className="font-medium">{line.nombre}</div>
                            <div className="text-xs text-muted-foreground font-mono">{line.unidad}</div>
                          </div>
                          <input type="hidden" name="items_catalog_item_id" value={line.catalog_item_id} readOnly />
                          <input type="hidden" name="items_orden_compra_item_id" value={line.orden_compra_item_id} readOnly />
                        </TableCell>
                        <TableCell className="w-28">
                          <Input value={line.cantidad_solicitada.toString()} readOnly aria-label={`Solicitado ${line.nombre}`} />
                        </TableCell>
                        <TableCell className="w-28">
                          <Input
                            name="items_cantidad_recibida"
                            type="number"
                            min="0"
                            step="0.001"
                            value={Number.isFinite(line.cantidad_recibida) ? line.cantidad_recibida : 0}
                            onChange={(event) => updateLine(index, { cantidad_recibida: Number(event.target.value) })}
                            aria-label={`Recibido ${line.nombre}`}
                          />
                        </TableCell>
                        <TableCell className="w-36">
                          <Input
                            name="items_costo_unitario_real"
                            type="number"
                            min="0"
                            step="0.0001"
                            value={Number.isFinite(line.costo_unitario_real) ? line.costo_unitario_real : 0}
                            onChange={(event) => updateLine(index, { costo_unitario_real: Number(event.target.value) })}
                            aria-label={`Costo unitario ${line.nombre}`}
                          />
                        </TableCell>
                        <TableCell className="min-w-64">
                          <div className="grid gap-2 md:grid-cols-2">
                            <Input
                              name="items_lote_codigo"
                              placeholder="Lote"
                              value={line.lote_codigo}
                              onChange={(event) => updateLine(index, { lote_codigo: event.target.value })}
                            />
                            <Input
                              name="items_serie"
                              placeholder="Serie"
                              value={line.serie}
                              onChange={(event) => updateLine(index, { serie: event.target.value })}
                            />
                            <Input
                              name="items_fecha_caducidad"
                              type="date"
                              value={line.fecha_caducidad}
                              onChange={(event) => updateLine(index, { fecha_caducidad: event.target.value })}
                            />
                            <Input
                              name="items_observaciones"
                              placeholder="Observación"
                              value={line.observaciones}
                              onChange={(event) => updateLine(index, { observaciones: event.target.value })}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${getLineStatus(line).className}`}
                          >
                            {getLineStatus(line).label}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <Button type="submit" disabled={!lines.length}>
              Registrar recepción
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alta visual</CardTitle>
          <CardDescription>Todo lo que el usuario ve es simple y claro.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="text-sm font-medium">Almacenes</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {almacenes.length ? `${almacenes.length} disponibles` : "Aún no hay almacenes"}
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="text-sm font-medium">Órdenes abiertas</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {ordenes.length ? `${ordenes.length} órdenes listas para recibir` : "No hay órdenes abiertas"}
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="text-sm font-medium">Recepciones recientes</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {recepciones.length ? `${recepciones.length} registros recientes` : "Sin movimientos todavía"}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="xl:col-span-3">
        <CardHeader>
          <CardTitle>Existencias por almacén</CardTitle>
          <CardDescription>Consulta rápida del stock real disponible para cada almacén.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="existencias-almacen">
                Almacén
              </label>
              <select
                id="existencias-almacen"
                value={selectedExistenceWarehouseId}
                onChange={(event) => setSelectedExistenceWarehouseId(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Todos los almacenes</option>
                {almacenes.map((almacen) => (
                  <option key={String(almacen.id)} value={String(almacen.id)}>
                    {asString(almacen.codigo)} · {asString(almacen.nombre)}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Líneas</div>
              <div className="mt-1 text-2xl font-semibold">{filteredExistencias.length}</div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Stock actual</div>
              <div className="mt-1 text-2xl font-semibold">{totalStockActual.toFixed(3)}</div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Alertas</div>
              <div className="mt-1 text-2xl font-semibold">{alertasStock}</div>
              <div className="text-xs text-muted-foreground">{totalStockDisponible.toFixed(3)} disponibles</div>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Almacén</TableHead>
                  <TableHead>Actual</TableHead>
                  <TableHead>Reservado</TableHead>
                  <TableHead>Disponible</TableHead>
                  <TableHead>Mínimo</TableHead>
                  <TableHead>Objetivo</TableHead>
                  <TableHead>Costo último</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!filteredExistencias.length ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                      Todavía no hay existencias registradas para este almacén.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredExistencias.map((existencia) => {
                    const catalogItem = existencia.catalog_item && typeof existencia.catalog_item === "object" ? (existencia.catalog_item as AnyRecord) : {}
                    const almacen = existencia.almacen && typeof existencia.almacen === "object" ? (existencia.almacen as AnyRecord) : {}
                    const disponible = asNumber(existencia.stock_disponible)
                    const minimo = asNumber(existencia.stock_minimo)
                    const esAlerta = Number.isFinite(minimo) && minimo > 0 && disponible <= minimo
                    return (
                      <TableRow key={String(existencia.id)}>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium">{asString(catalogItem.nombre, "Producto")}</div>
                            <div className="text-xs text-muted-foreground">{asString(catalogItem.codigo, "Sin código")}</div>
                          </div>
                        </TableCell>
                        <TableCell>{asString(almacen.nombre, "Almacén")}</TableCell>
                        <TableCell>{asNumber(existencia.stock_actual).toFixed(3)}</TableCell>
                        <TableCell>{asNumber(existencia.stock_reservado).toFixed(3)}</TableCell>
                        <TableCell>
                          <span className={esAlerta ? "font-semibold text-rose-600" : "font-medium"}>
                            {disponible.toFixed(3)}
                          </span>
                        </TableCell>
                        <TableCell>{Number.isFinite(minimo) && minimo > 0 ? minimo.toFixed(3) : "—"}</TableCell>
                        <TableCell>
                          {Number.isFinite(asNumber(existencia.stock_objetivo)) && asNumber(existencia.stock_objetivo) > 0
                            ? asNumber(existencia.stock_objetivo).toFixed(3)
                            : "—"}
                        </TableCell>
                        <TableCell>{formatCurrency(existencia.costo_ultimo)}</TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
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
    </div>
  )
}
