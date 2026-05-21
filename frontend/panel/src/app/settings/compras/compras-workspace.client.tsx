"use client"

import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import {
  createAlmacenAction,
  createOrdenCompraAction,
  createProveedorAction,
  createRecepcionAction,
  cancelOrdenCompraAction,
  deleteAlmacenAction,
  deleteOrdenCompraAction,
  deleteProveedorAction,
  updateAlmacenAction,
  updateProveedorAction,
} from "./actions"

type AnyRecord = Record<string, unknown>

type ComprasWorkspaceProps = {
  almacenes: AnyRecord[]
  proveedores: AnyRecord[]
  catalogItems: AnyRecord[]
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

type OrderLine = {
  catalog_item_id: string
  proveedor_item_id: string
  nombre: string
  unidad: string
  cantidad_solicitada: number
  costo_unitario: number
  descuento_porcentaje: string
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

function createSuggestedOrderNumber(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  return `OC-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(
    now.getMinutes(),
  )}${pad(now.getSeconds())}`
}

function createEmptyOrderLine(): OrderLine {
  return {
    catalog_item_id: "",
    proveedor_item_id: "",
    nombre: "",
    unidad: "unidad",
    cantidad_solicitada: 1,
    costo_unitario: 0,
    descuento_porcentaje: "",
    observaciones: "",
  }
}

export function ComprasWorkspace({
  almacenes,
  proveedores,
  catalogItems,
  ordenes,
  recepciones,
  existencias,
  defaultOrderId,
  defaultWarehouseId,
  defaultReceptionNumber,
}: ComprasWorkspaceProps) {
  const openOrders = useMemo(
    () =>
      ordenes.filter((orden) =>
        ["borrador", "enviada", "aprobada", "parcial"].includes(String(orden.estado ?? "").toLowerCase()),
      ),
    [ordenes],
  )
  const initialOrder = useMemo(
    () => openOrders.find((orden) => String(orden.id) === defaultOrderId) ?? openOrders[0] ?? null,
    [defaultOrderId, openOrders],
  )
  const [selectedOrderId, setSelectedOrderId] = useState<string>(String(initialOrder?.id ?? ""))
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(defaultWarehouseId)
  const [lines, setLines] = useState<ReceptionLine[]>(() => buildLinesFromOrder(initialOrder))
  const [receptionNumber, setReceptionNumber] = useState<string>(defaultReceptionNumber || createSuggestedReceptionNumber())
  const [referenceExternal, setReferenceExternal] = useState("")
  const [observations, setObservations] = useState("")
  const [editingWarehouseId, setEditingWarehouseId] = useState<string | null>(null)
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null)
  const [providerFormCode, setProviderFormCode] = useState("")
  const [providerFormName, setProviderFormName] = useState("")
  const [providerFormCommercialName, setProviderFormCommercialName] = useState("")
  const [providerFormEmail, setProviderFormEmail] = useState("")
  const [providerFormPhone, setProviderFormPhone] = useState("")
  const [providerFormTax, setProviderFormTax] = useState("")
  const [providerFormPayDays, setProviderFormPayDays] = useState("")
  const [providerFormLeadDays, setProviderFormLeadDays] = useState("")
  const [providerFormActive, setProviderFormActive] = useState(true)
  const [orderFolio, setOrderFolio] = useState(createSuggestedOrderNumber())
  const [orderProviderId, setOrderProviderId] = useState<string>(String(proveedores[0]?.id ?? ""))
  const [orderWarehouseId, setOrderWarehouseId] = useState<string>(defaultWarehouseId)
  const [orderDueDate, setOrderDueDate] = useState("")
  const [orderCurrency, setOrderCurrency] = useState("MXN")
  const [orderReferenceExternal, setOrderReferenceExternal] = useState("")
  const [orderObservations, setOrderObservations] = useState("")
  const [orderInstructions, setOrderInstructions] = useState("")
  const [orderLines, setOrderLines] = useState<OrderLine[]>(() => [createEmptyOrderLine()])
  const [warehouseFormCode, setWarehouseFormCode] = useState("")
  const [warehouseFormName, setWarehouseFormName] = useState("")
  const [warehouseFormType, setWarehouseFormType] = useState<"central" | "sucursal" | "transito" | "consignacion">("central")
  const [warehouseFormPhone, setWarehouseFormPhone] = useState("")
  const [warehouseFormEmail, setWarehouseFormEmail] = useState("")
  const [warehouseFormActive, setWarehouseFormActive] = useState(true)
  const [warehouseFormPrincipal, setWarehouseFormPrincipal] = useState(!almacenes.length)
  const [selectedExistenceWarehouseId, setSelectedExistenceWarehouseId] = useState<string>(defaultWarehouseId)

  useEffect(() => {
    const currentOrder = openOrders.find((orden) => String(orden.id) === selectedOrderId) ?? null
    setLines(buildLinesFromOrder(currentOrder))
    setSelectedWarehouseId((currentOrder?.almacen_destino_id as string | undefined) || defaultWarehouseId)
  }, [defaultWarehouseId, openOrders, selectedOrderId])

  const selectedOrder = openOrders.find((orden) => String(orden.id) === selectedOrderId) ?? null
  const selectedProvider = selectedOrder && typeof selectedOrder.proveedor === "object" ? (selectedOrder.proveedor as AnyRecord) : null

  const totalReceived = lines.reduce((sum, line) => sum + (Number.isFinite(line.cantidad_recibida) ? line.cantidad_recibida : 0), 0)
  const totalValue = lines.reduce((sum, line) => sum + (Number.isFinite(line.cantidad_recibida) ? line.cantidad_recibida : 0) * (Number.isFinite(line.costo_unitario_real) ? line.costo_unitario_real : 0), 0)
  const orderSubtotal = orderLines.reduce((sum, line) => {
    const qty = Number.isFinite(line.cantidad_solicitada) ? line.cantidad_solicitada : 0
    const cost = Number.isFinite(line.costo_unitario) ? line.costo_unitario : 0
    const discount = Number.parseFloat(line.descuento_porcentaje || "0")
    const gross = qty * cost
    const net = gross - (Number.isFinite(discount) ? gross * discount / 100 : 0)
    return sum + net
  }, 0)
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

  const updateOrderLine = (index: number, patch: Partial<OrderLine>) => {
    setOrderLines((current) => current.map((line, currentIndex) => (currentIndex === index ? { ...line, ...patch } : line)))
  }

  const addOrderLine = () => {
    setOrderLines((current) => [...current, createEmptyOrderLine()])
  }

  const removeOrderLine = (index: number) => {
    setOrderLines((current) => current.filter((_, currentIndex) => currentIndex !== index))
  }

  const setOrderLineFromCatalog = (index: number, catalogItemId: string) => {
    const item = catalogItems.find((entry) => String(entry.id) === catalogItemId) ?? null
    const unidad = asString(item?.unidad, "unidad")
    const costo = asNumber(item?.costo_ultimo ?? item?.costoUltimo ?? item?.costo_promedio ?? item?.costoPromedio)
    updateOrderLine(index, {
      catalog_item_id: catalogItemId,
      proveedor_item_id: "",
      nombre: asString(item?.nombre, "Producto"),
      unidad,
      cantidad_solicitada: Number.isFinite(orderLines[index]?.cantidad_solicitada) ? orderLines[index]!.cantidad_solicitada : 1,
      costo_unitario: Number.isFinite(costo) && costo > 0 ? costo : 0,
    })
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

  const warehouseFormAction = editingWarehouseId
    ? updateAlmacenAction.bind(null, editingWarehouseId)
    : createAlmacenAction
  const providerFormAction = editingProviderId
    ? updateProveedorAction.bind(null, editingProviderId)
    : createProveedorAction
  const orderFormAction = createOrdenCompraAction

  const startEditWarehouse = (almacen: AnyRecord) => {
    setEditingWarehouseId(String(almacen.id))
    setWarehouseFormCode(asString(almacen.codigo, ""))
    setWarehouseFormName(asString(almacen.nombre, ""))
    setWarehouseFormType((asString(almacen.tipo, "central") as typeof warehouseFormType) || "central")
    setWarehouseFormPhone(asString(almacen.telefono, ""))
    setWarehouseFormEmail(asString(almacen.email, ""))
    setWarehouseFormActive(Boolean(almacen.activo))
    setWarehouseFormPrincipal(Boolean(almacen.es_principal))
  }

  const clearWarehouseForm = () => {
    setEditingWarehouseId(null)
    setWarehouseFormCode("")
    setWarehouseFormName("")
    setWarehouseFormType("central")
    setWarehouseFormPhone("")
    setWarehouseFormEmail("")
    setWarehouseFormActive(true)
    setWarehouseFormPrincipal(false)
  }

  const startEditProvider = (proveedor: AnyRecord) => {
    setEditingProviderId(String(proveedor.id))
    setProviderFormCode(asString(proveedor.codigo_proveedor, ""))
    setProviderFormName(asString(proveedor.razon_social, ""))
    setProviderFormCommercialName(asString(proveedor.nombre_comercial, ""))
    setProviderFormEmail(asString(proveedor.correo, ""))
    setProviderFormPhone(asString(proveedor.telefono, ""))
    setProviderFormTax(asString(proveedor.rfc, ""))
    setProviderFormPayDays(asString(proveedor.plazo_pago_dias, ""))
    setProviderFormLeadDays(asString(proveedor.plazo_entrega_dias, ""))
    setProviderFormActive(Boolean(proveedor.activo))
  }

  const clearProviderForm = () => {
    setEditingProviderId(null)
    setProviderFormCode("")
    setProviderFormName("")
    setProviderFormCommercialName("")
    setProviderFormEmail("")
    setProviderFormPhone("")
    setProviderFormTax("")
    setProviderFormPayDays("")
    setProviderFormLeadDays("")
    setProviderFormActive(true)
  }

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Alta rápida de almacén</CardTitle>
          <CardDescription>Crea un almacén con datos simples y claros.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={warehouseFormAction} className="space-y-4">
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
            <div className="flex gap-2">
              <Button type="submit" className="flex-1">
                {editingWarehouseId ? "Actualizar almacén" : "Guardar almacén"}
              </Button>
              {editingWarehouseId ? (
                <Button type="button" variant="outline" onClick={clearWarehouseForm}>
                  Cancelar
                </Button>
              ) : null}
            </div>
          </form>
          <div className="mt-4 overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!almacenes.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                      Aún no hay almacenes.
                    </TableCell>
                  </TableRow>
                ) : (
                  almacenes.map((almacen) => (
                    <TableRow key={String(almacen.id)}>
                      <TableCell className="font-mono text-xs">{asString(almacen.codigo)}</TableCell>
                      <TableCell>{asString(almacen.nombre)}</TableCell>
                      <TableCell>{asString(almacen.tipo)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => startEditWarehouse(almacen)}>
                            Editar
                          </Button>
                          <form action={deleteAlmacenAction.bind(null, String(almacen.id))}>
                            <Button type="submit" variant="ghost" size="sm">
                              Eliminar
                            </Button>
                          </form>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alta rápida de proveedor</CardTitle>
          <CardDescription>Registra un proveedor para poder generar órdenes de compra.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={providerFormAction} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="proveedor-codigo">
                Código
              </label>
              <Input id="proveedor-codigo" name="codigo_proveedor" value={providerFormCode} onChange={(event) => setProviderFormCode(event.target.value)} placeholder="PROV-001" required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="proveedor-razon">
                Razón social
              </label>
              <Input id="proveedor-razon" name="razon_social" value={providerFormName} onChange={(event) => setProviderFormName(event.target.value)} placeholder="Proveedor SA de CV" required />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="proveedor-comercial">
                Nombre comercial
              </label>
              <Input id="proveedor-comercial" name="nombre_comercial" value={providerFormCommercialName} onChange={(event) => setProviderFormCommercialName(event.target.value)} placeholder="Proveedor visible" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="proveedor-correo">
                  Correo
                </label>
                <Input id="proveedor-correo" name="correo" type="email" value={providerFormEmail} onChange={(event) => setProviderFormEmail(event.target.value)} placeholder="ventas@proveedor.com" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="proveedor-telefono">
                  Teléfono
                </label>
                <Input id="proveedor-telefono" name="telefono" value={providerFormPhone} onChange={(event) => setProviderFormPhone(event.target.value)} placeholder="55 5555 5555" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="proveedor-plazo-pago">
                  Plazo pago
                </label>
                <Input id="proveedor-plazo-pago" name="plazo_pago_dias" type="number" min="0" value={providerFormPayDays} onChange={(event) => setProviderFormPayDays(event.target.value)} placeholder="30" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="proveedor-plazo-entrega">
                  Plazo entrega
                </label>
                <Input id="proveedor-plazo-entrega" name="plazo_entrega_dias" type="number" min="0" value={providerFormLeadDays} onChange={(event) => setProviderFormLeadDays(event.target.value)} placeholder="5" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="proveedor-rfc">
                RFC
              </label>
              <Input id="proveedor-rfc" name="rfc" value={providerFormTax} onChange={(event) => setProviderFormTax(event.target.value)} placeholder="RFC del proveedor" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="activo" checked={providerFormActive} onChange={(event) => setProviderFormActive(event.target.checked)} />
              Activo
            </label>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1">
                {editingProviderId ? "Actualizar proveedor" : "Guardar proveedor"}
              </Button>
              {editingProviderId ? (
                <Button type="button" variant="outline" onClick={clearProviderForm}>
                  Cancelar
                </Button>
              ) : null}
            </div>
          </form>
          <div className="mt-4 overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Razón social</TableHead>
                  <TableHead>Activo</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!proveedores.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                      Aún no hay proveedores.
                    </TableCell>
                  </TableRow>
                ) : (
                  proveedores.map((proveedor) => (
                    <TableRow key={String(proveedor.id)}>
                      <TableCell className="font-mono text-xs">{asString(proveedor.codigo_proveedor)}</TableCell>
                      <TableCell>{asString(proveedor.razon_social)}</TableCell>
                      <TableCell>{Boolean(proveedor.activo) ? "Sí" : "No"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => startEditProvider(proveedor)}>
                            Editar
                          </Button>
                          <form action={deleteProveedorAction.bind(null, String(proveedor.id))}>
                            <Button type="submit" variant="ghost" size="sm">
                              Eliminar
                            </Button>
                          </form>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>Crear orden de compra</CardTitle>
          <CardDescription>Selecciona proveedor, almacén y productos. Todo se guarda en una sola operación.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createOrdenCompraAction} className="space-y-5">
            <input type="hidden" name="fecha_emision" value={new Date().toISOString()} readOnly />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="orden-folio">
                  Folio
                </label>
                <Input id="orden-folio" name="folio" value={orderFolio} onChange={(event) => setOrderFolio(event.target.value)} required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="orden-moneda">
                  Moneda
                </label>
                <select id="orden-moneda" name="moneda" value={orderCurrency} onChange={(event) => setOrderCurrency(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="MXN">MXN</option>
                  <option value="USD">USD</option>
                  <option value="COP">COP</option>
                  <option value="CLP">CLP</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="orden-proveedor">
                  Proveedor
                </label>
                <select id="orden-proveedor" name="proveedor_id" value={orderProviderId} onChange={(event) => setOrderProviderId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required>
                  <option value="">Selecciona un proveedor</option>
                  {proveedores.map((proveedor) => (
                    <option key={String(proveedor.id)} value={String(proveedor.id)}>
                      {asString(proveedor.codigo_proveedor)} · {asString(proveedor.razon_social)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="orden-almacen">
                  Almacén destino
                </label>
                <select id="orden-almacen" name="almacen_destino_id" value={orderWarehouseId} onChange={(event) => setOrderWarehouseId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required>
                  <option value="">Selecciona un almacén</option>
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
                <label className="text-sm font-medium" htmlFor="orden-entrega">
                  Fecha estimada
                </label>
                <Input id="orden-entrega" name="fecha_entrega_estimada" type="date" value={orderDueDate} onChange={(event) => setOrderDueDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="orden-ref">
                  Referencia externa
                </label>
                <Input id="orden-ref" name="referencia_externa" value={orderReferenceExternal} onChange={(event) => setOrderReferenceExternal(event.target.value)} placeholder="Cotización, solicitud..." />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="orden-notas">
                  Observaciones
                </label>
                <Input id="orden-notas" name="observaciones" value={orderObservations} onChange={(event) => setOrderObservations(event.target.value)} placeholder="Notas para compras" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="orden-instrucciones">
                Instrucciones de entrega
              </label>
              <Input id="orden-instrucciones" name="instrucciones_entrega" value={orderInstructions} onChange={(event) => setOrderInstructions(event.target.value)} placeholder="Horario, recepción, contacto..." />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" onClick={addOrderLine}>
                Agregar producto
              </Button>
              <div className="ml-auto text-sm text-muted-foreground">
                {orderLines.length} líneas · {formatCurrency(orderSubtotal)}
              </div>
            </div>
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Cantidad</TableHead>
                    <TableHead>Costo</TableHead>
                    <TableHead>Desc %</TableHead>
                    <TableHead>Observaciones</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orderLines.map((line, index) => (
                    <TableRow key={`${line.catalog_item_id || "new"}-${index}`}>
                      <TableCell className="align-top">
                        <div className="space-y-2 min-w-72">
                          <select
                            value={line.catalog_item_id}
                            onChange={(event) => setOrderLineFromCatalog(index, event.target.value)}
                            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            required
                          >
                            <option value="">Selecciona producto</option>
                            {catalogItems.map((item) => (
                              <option key={String(item.id)} value={String(item.id)}>
                                {asString(item.nombre)} · {asString(item.unidad, "unidad")}
                              </option>
                            ))}
                          </select>
                          <div className="text-xs text-muted-foreground">
                            {line.unidad || "unidad"} · costo sugerido {formatCurrency(line.costo_unitario)}
                          </div>
                          <input type="hidden" name="items_catalog_item_id" value={line.catalog_item_id} readOnly />
                          <input type="hidden" name="items_proveedor_item_id" value={line.proveedor_item_id} readOnly />
                          <input type="hidden" name="items_unidad" value={line.unidad} readOnly />
                          <input type="hidden" name="items_impuestos" value="0" readOnly />
                        </div>
                      </TableCell>
                      <TableCell className="w-28 align-top">
                        <Input
                          name="items_cantidad_solicitada"
                          type="number"
                          min="0"
                          step="0.001"
                          value={Number.isFinite(line.cantidad_solicitada) ? line.cantidad_solicitada : 0}
                          onChange={(event) => updateOrderLine(index, { cantidad_solicitada: Number(event.target.value) })}
                        />
                      </TableCell>
                      <TableCell className="w-36 align-top">
                        <Input
                          name="items_costo_unitario"
                          type="number"
                          min="0"
                          step="0.0001"
                          value={Number.isFinite(line.costo_unitario) ? line.costo_unitario : 0}
                          onChange={(event) => updateOrderLine(index, { costo_unitario: Number(event.target.value) })}
                        />
                      </TableCell>
                      <TableCell className="w-28 align-top">
                        <Input
                          name="items_descuento_porcentaje"
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={line.descuento_porcentaje}
                          onChange={(event) => updateOrderLine(index, { descuento_porcentaje: event.target.value })}
                          placeholder="0"
                        />
                      </TableCell>
                      <TableCell className="align-top">
                        <Input
                          name="items_observaciones"
                          value={line.observaciones}
                          onChange={(event) => updateOrderLine(index, { observaciones: event.target.value })}
                          placeholder="Opcional"
                        />
                      </TableCell>
                      <TableCell className="text-right align-top">
                        <Button type="button" variant="ghost" size="sm" onClick={() => removeOrderLine(index)} disabled={orderLines.length <= 1}>
                          Quitar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button type="submit" disabled={!orderLines.length || !orderProviderId || !orderWarehouseId}>
              Guardar orden de compra
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
                  {openOrders.map((orden) => (
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
              {openOrders.length ? `${openOrders.length} órdenes listas para recibir` : "No hay órdenes abiertas"}
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

      <Card className="xl:col-span-3">
        <CardHeader>
          <CardTitle>Órdenes de compra recientes</CardTitle>
          <CardDescription>Vista rápida de las compras registradas y su estado actual.</CardDescription>
        </CardHeader>
        <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Folio</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Almacén</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!ordenes.length ? (
                  <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    Aún no hay órdenes de compra registradas.
                  </TableCell>
                </TableRow>
              ) : (
                ordenes.map((orden) => (
                  <TableRow key={String(orden.id)}>
                    <TableCell className="font-mono text-xs">{asString(orden.folio)}</TableCell>
                    <TableCell>{asString((orden.proveedor as AnyRecord | undefined)?.razon_social ?? (orden.proveedor as AnyRecord | undefined)?.nombre_comercial, "Proveedor")}</TableCell>
                    <TableCell>{asString((orden.almacen as AnyRecord | undefined)?.nombre, "Almacén")}</TableCell>
                    <TableCell>{asString(orden.estado)}</TableCell>
                    <TableCell>{formatDateTime(orden.fecha_emision)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(orden.total)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {String(orden.estado ?? "").toLowerCase() !== "cancelada" ? (
                          <form action={cancelOrdenCompraAction.bind(null, String(orden.id))}>
                            <Button type="submit" variant="outline" size="sm">
                              Cancelar
                            </Button>
                          </form>
                        ) : null}
                        <form action={deleteOrdenCompraAction.bind(null, String(orden.id))}>
                          <Button type="submit" variant="ghost" size="sm">
                            Eliminar
                          </Button>
                        </form>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
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
