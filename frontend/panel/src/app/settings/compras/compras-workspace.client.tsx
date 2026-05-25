"use client"

import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { ContactCatalogSelect, mergeCatalogOptions } from "@/components/contactos/contact-catalog-select"

import {
  createAlmacenAction,
  createInventarioAjusteAction,
  createOrdenCompraAction,
  createProveedorAction,
  createRecepcionAction,
  cancelOrdenCompraAction,
  approveOrdenCompraAction,
  closeOrdenCompraAction,
  deleteAlmacenAction,
  deleteOrdenCompraAction,
  deleteProveedorAction,
  sendOrdenCompraAction,
  updateAlmacenAction,
  updateOrdenCompraAction,
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
  incoterms: AnyRecord[]
  monedas: AnyRecord[]
  modosTransporte: AnyRecord[]
  paises: AnyRecord[]
  defaultOrderId: string
  defaultWarehouseId: string
  defaultWarehouseCode: string
  defaultProviderCode: string
  defaultReceptionNumber: string
  defaultOrderFolio: string
  defaultOrderEmissionIso: string
  activeView: "resumen" | "almacenes" | "proveedores" | "ordenes" | "inventario" | "recepciones"
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
  numero_partida: string
  nombre: string
  unidad: string
  cantidad_solicitada: number
  costo_unitario: number
  descuento_porcentaje: string
  descripcion: string
  marca: string
  modelo: string
  fabricante: string
  pais_origen_codigo_iso2: string
  pais_procedencia_codigo_iso2: string
  fraccion_arancelaria: string
  hs_code: string
  nico: string
  peso_neto: string
  peso_bruto: string
  volumen_cbm: string
  lote: string
  numero_serie: string
  fecha_caducidad: string
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
    timeZone: "America/Mexico_City",
  }).format(parsed)
}

function getOrderStatusBadge(estado: unknown): { label: string; className: string } {
  const normalized = String(estado ?? "").toLowerCase()
  if (normalized === "borrador") {
    return { label: "Borrador", className: "border-amber-200 bg-amber-50 text-amber-700" }
  }
  if (normalized === "enviada") {
    return { label: "Enviada", className: "border-sky-200 bg-sky-50 text-sky-700" }
  }
  if (normalized === "aprobada") {
    return { label: "Aprobada", className: "border-violet-200 bg-violet-50 text-violet-700" }
  }
  if (normalized === "recibida") {
    return { label: "Recibida", className: "border-emerald-200 bg-emerald-50 text-emerald-700" }
  }
  if (normalized === "cerrada") {
    return { label: "Cerrada", className: "border-slate-200 bg-slate-100 text-slate-700" }
  }
  if (normalized === "cancelada") {
    return { label: "Cancelada", className: "border-rose-200 bg-rose-50 text-rose-700" }
  }
  return { label: normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "—", className: "border-border bg-muted text-muted-foreground" }
}

function getAuditLabel(user: unknown, fallback = "Sin registrar"): string {
  const record = user && typeof user === "object" ? (user as AnyRecord) : null
  return asString(record?.nombre_completo ?? record?.nombre ?? record?.correo, fallback)
}

function toSelectOptions(
  records: AnyRecord[],
  valueKey: string,
  labelBuilder: (record: AnyRecord) => string,
): Array<{ value: string; label: string }> {
  const seen = new Set<string>()
  return records
    .map((record) => ({
      value: asString(record[valueKey], ""),
      label: labelBuilder(record),
    }))
    .filter((option) => {
      if (!option.value || seen.has(option.value)) {
        return false
      }
      seen.add(option.value)
      return true
    })
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

function buildOrderLinesFromOrder(order: AnyRecord | undefined | null): OrderLine[] {
  if (!order || !Array.isArray(order.items) || !order.items.length) {
    return [createEmptyOrderLine()]
  }
  return order.items
    .filter((item): item is AnyRecord => Boolean(item) && typeof item === "object")
    .map((item) => {
      const catalogItem = item.catalog_item && typeof item.catalog_item === "object" ? (item.catalog_item as AnyRecord) : {}
      return {
        catalog_item_id: asString(item.catalog_item_id, ""),
        proveedor_item_id: asString(item.proveedor_item_id, ""),
        numero_partida: asString(item.numero_partida, ""),
        nombre: asString(catalogItem.nombre, "Producto"),
        unidad: asString(item.unidad ?? catalogItem.unidad, "unidad"),
        cantidad_solicitada: asNumber(item.cantidad_solicitada),
        costo_unitario: asNumber(item.costo_unitario),
        descuento_porcentaje: asString(item.descuento_porcentaje, ""),
        descripcion: asString(item.descripcion, ""),
        marca: asString(item.marca, ""),
        modelo: asString(item.modelo, ""),
        fabricante: asString(item.fabricante, ""),
        pais_origen_codigo_iso2: asString(item.pais_origen_codigo_iso2, ""),
        pais_procedencia_codigo_iso2: asString(item.pais_procedencia_codigo_iso2, ""),
        fraccion_arancelaria: asString(item.fraccion_arancelaria, ""),
        hs_code: asString(item.hs_code, ""),
        nico: asString(item.nico, ""),
        peso_neto: asString(item.peso_neto, ""),
        peso_bruto: asString(item.peso_bruto, ""),
        volumen_cbm: asString(item.volumen_cbm, ""),
        lote: asString(item.lote, ""),
        numero_serie: asString(item.numero_serie, ""),
        fecha_caducidad: asString(item.fecha_caducidad, ""),
        observaciones: asString(item.observaciones, ""),
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

function createEmptyOrderLine(): OrderLine {
  return {
    catalog_item_id: "",
    proveedor_item_id: "",
    numero_partida: "",
    nombre: "",
    unidad: "unidad",
    cantidad_solicitada: 1,
    costo_unitario: 0,
    descuento_porcentaje: "",
    descripcion: "",
    marca: "",
    modelo: "",
    fabricante: "",
    pais_origen_codigo_iso2: "",
    pais_procedencia_codigo_iso2: "",
    fraccion_arancelaria: "",
    hs_code: "",
    nico: "",
    peso_neto: "",
    peso_bruto: "",
    volumen_cbm: "",
    lote: "",
    numero_serie: "",
    fecha_caducidad: "",
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
  incoterms,
  monedas,
  modosTransporte,
  paises,
  defaultOrderId,
  defaultWarehouseId,
  defaultWarehouseCode,
  defaultProviderCode,
  defaultReceptionNumber,
  defaultOrderFolio,
  defaultOrderEmissionIso,
  activeView,
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
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null)
  const [providerFormCode, setProviderFormCode] = useState(defaultProviderCode)
  const [providerFormName, setProviderFormName] = useState("")
  const [providerFormCommercialName, setProviderFormCommercialName] = useState("")
  const [providerFormEmail, setProviderFormEmail] = useState("")
  const [providerFormPhone, setProviderFormPhone] = useState("")
  const [providerFormTax, setProviderFormTax] = useState("")
  const [providerFormPayDays, setProviderFormPayDays] = useState("")
  const [providerFormLeadDays, setProviderFormLeadDays] = useState("")
  const [providerFormActive, setProviderFormActive] = useState(true)
  const [orderFolio, setOrderFolio] = useState(defaultOrderFolio)
  const [orderProviderId, setOrderProviderId] = useState<string>(String(proveedores[0]?.id ?? ""))
  const [orderWarehouseId, setOrderWarehouseId] = useState<string>(defaultWarehouseId)
  const [orderEmissionIso, setOrderEmissionIso] = useState(defaultOrderEmissionIso)
  const [orderDueDate, setOrderDueDate] = useState("")
  const [orderType, setOrderType] = useState<"nacional" | "internacional">("nacional")
  const [orderCurrency, setOrderCurrency] = useState("MXN")
  const [orderExchangeRate, setOrderExchangeRate] = useState("")
  const [orderVigenciaHasta, setOrderVigenciaHasta] = useState("")
  const [orderProformaReferencia, setOrderProformaReferencia] = useState("")
  const [orderReferenceExternal, setOrderReferenceExternal] = useState("")
  const [orderObservations, setOrderObservations] = useState("")
  const [orderInstructions, setOrderInstructions] = useState("")
  const [orderLines, setOrderLines] = useState<OrderLine[]>(() => [createEmptyOrderLine()])
  const [orderIncotermCodigo, setOrderIncotermCodigo] = useState("")
  const [orderIncotermVersion, setOrderIncotermVersion] = useState("2020")
  const [orderLugarIncoterm, setOrderLugarIncoterm] = useState("")
  const [orderResponsableFlete, setOrderResponsableFlete] = useState("")
  const [orderResponsableSeguro, setOrderResponsableSeguro] = useState("")
  const [orderResponsableDespachoExportacion, setOrderResponsableDespachoExportacion] = useState("")
  const [orderResponsableDespachoImportacion, setOrderResponsableDespachoImportacion] = useState("")
  const [orderResponsableImpuestosImportacion, setOrderResponsableImpuestosImportacion] = useState("")
  const [orderPermiteEmbarquesParciales, setOrderPermiteEmbarquesParciales] = useState(true)
  const [orderPermiteTransbordos, setOrderPermiteTransbordos] = useState(true)
  const [orderGastosBancarios, setOrderGastosBancarios] = useState("")
  const [orderCondicionesComercialesObservaciones, setOrderCondicionesComercialesObservaciones] = useState("")
  const [orderFormaPago, setOrderFormaPago] = useState("")
  const [orderPorcentajeAnticipo, setOrderPorcentajeAnticipo] = useState("")
  const [orderMontoAnticipo, setOrderMontoAnticipo] = useState("")
  const [orderPorcentajeSaldo, setOrderPorcentajeSaldo] = useState("")
  const [orderMontoSaldo, setOrderMontoSaldo] = useState("")
  const [orderMomentoPagoSaldo, setOrderMomentoPagoSaldo] = useState("")
  const [orderDiasCredito, setOrderDiasCredito] = useState("")
  const [orderComisionesBancarias, setOrderComisionesBancarias] = useState("")
  const [orderCondicionesPagoObservaciones, setOrderCondicionesPagoObservaciones] = useState("")
  const [orderModoTransporteCodigo, setOrderModoTransporteCodigo] = useState("")
  const [orderFechaRequeridaEmbarque, setOrderFechaRequeridaEmbarque] = useState("")
  const [orderFechaEstimadaEmbarque, setOrderFechaEstimadaEmbarque] = useState("")
  const [orderFechaEstimadaArribo, setOrderFechaEstimadaArribo] = useState("")
  const [orderPuertoOrigen, setOrderPuertoOrigen] = useState("")
  const [orderPuertoDestino, setOrderPuertoDestino] = useState("")
  const [orderAeropuertoOrigen, setOrderAeropuertoOrigen] = useState("")
  const [orderAeropuertoDestino, setOrderAeropuertoDestino] = useState("")
  const [orderLugarEntregaFinal, setOrderLugarEntregaFinal] = useState("")
  const [orderDireccionEntrega, setOrderDireccionEntrega] = useState("")
  const [orderTipoEmbarque, setOrderTipoEmbarque] = useState("")
  const [orderTipoContenedor, setOrderTipoContenedor] = useState("")
  const [orderForwarderNombre, setOrderForwarderNombre] = useState("")
  const [orderNumeroBooking, setOrderNumeroBooking] = useState("")
  const [orderNumeroBlAwb, setOrderNumeroBlAwb] = useState("")
  const [orderTracking, setOrderTracking] = useState("")
  const [orderPesoNetoTotal, setOrderPesoNetoTotal] = useState("")
  const [orderPesoBrutoTotal, setOrderPesoBrutoTotal] = useState("")
  const [orderVolumenTotalCbm, setOrderVolumenTotalCbm] = useState("")
  const [orderCantidadBultos, setOrderCantidadBultos] = useState("")
  const [orderTipoEmpaque, setOrderTipoEmpaque] = useState("")
  const [orderMarcasEmbarque, setOrderMarcasEmbarque] = useState("")
  const [orderRequiereSeguro, setOrderRequiereSeguro] = useState(false)
  const [orderMontoAsegurado, setOrderMontoAsegurado] = useState("")
  const [orderLogisticaObservaciones, setOrderLogisticaObservaciones] = useState("")
  const [adjustmentWarehouseId, setAdjustmentWarehouseId] = useState<string>(defaultWarehouseId)
  const [adjustmentCatalogItemId, setAdjustmentCatalogItemId] = useState<string>(String(catalogItems[0]?.id ?? ""))
  const [adjustmentSentido, setAdjustmentSentido] = useState<"entrada" | "salida">("entrada")
  const [adjustmentCantidad, setAdjustmentCantidad] = useState("")
  const [adjustmentMotivo, setAdjustmentMotivo] = useState("")
  const [warehouseFormCode, setWarehouseFormCode] = useState(defaultWarehouseCode)
  const [warehouseFormName, setWarehouseFormName] = useState("")
  const [warehouseFormType, setWarehouseFormType] = useState<"central" | "sucursal" | "transito" | "consignacion">("central")
  const [warehouseFormPhone, setWarehouseFormPhone] = useState("")
  const [warehouseFormEmail, setWarehouseFormEmail] = useState("")
  const [warehouseFormActive, setWarehouseFormActive] = useState(true)
  const [warehouseFormPrincipal, setWarehouseFormPrincipal] = useState(!almacenes.length)
  const [selectedExistenceWarehouseId, setSelectedExistenceWarehouseId] = useState<string>(defaultWarehouseId)
  const [expandedOrderLineIndex, setExpandedOrderLineIndex] = useState<number | null>(null)

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
  const adjustmentExistencia = useMemo(
    () =>
      existencias.find(
        (row) => String(row.catalog_item_id) === adjustmentCatalogItemId && String(row.almacen_id) === adjustmentWarehouseId,
      ) ?? null,
    [adjustmentCatalogItemId, adjustmentWarehouseId, existencias],
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
  const incotermsOptions = useMemo(
    () => mergeCatalogOptions(toSelectOptions(incoterms, "codigo", (record) => `${asString(record.codigo)} · ${asString(record.nombre)}`), orderIncotermCodigo),
    [incoterms, orderIncotermCodigo],
  )
  const monedasOptions = useMemo(
    () => mergeCatalogOptions(toSelectOptions(monedas, "codigo", (record) => `${asString(record.codigo)} · ${asString(record.nombre)}`), orderCurrency),
    [monedas, orderCurrency],
  )
  const modosTransporteOptions = useMemo(
    () => mergeCatalogOptions(toSelectOptions(modosTransporte, "codigo", (record) => `${asString(record.codigo)} · ${asString(record.nombre)}`), orderModoTransporteCodigo),
    [modosTransporte, orderModoTransporteCodigo],
  )
  const paisesOptions = useMemo(
    () => mergeCatalogOptions(toSelectOptions(paises, "codigo_iso2", (record) => `${asString(record.codigo_iso2)} · ${asString(record.nombre)}`), ""),
    [paises],
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
      numero_partida: orderLines[index]?.numero_partida || String(index + 1),
      nombre: asString(item?.nombre, "Producto"),
      unidad,
      cantidad_solicitada: Number.isFinite(orderLines[index]?.cantidad_solicitada) ? orderLines[index]!.cantidad_solicitada : 1,
      costo_unitario: Number.isFinite(costo) && costo > 0 ? costo : 0,
      descripcion: orderLines[index]?.descripcion || asString(item?.nombre, "Producto"),
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
  const orderFormAction = editingOrderId
    ? updateOrdenCompraAction.bind(null, editingOrderId)
    : createOrdenCompraAction

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
    setWarehouseFormCode(defaultWarehouseCode)
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

  const startEditOrder = (orden: AnyRecord) => {
    setEditingOrderId(String(orden.id))
    setOrderFolio(asString(orden.folio, defaultOrderFolio))
    setOrderProviderId(asString(orden.proveedor_id, ""))
    setOrderWarehouseId(asString(orden.almacen_destino_id, defaultWarehouseId))
    setOrderEmissionIso(asString(orden.fecha_emision, defaultOrderEmissionIso))
    setOrderDueDate(asString(orden.fecha_entrega_estimada, ""))
    setOrderType((asString(orden.tipo_operacion, "nacional") as "nacional" | "internacional") || "nacional")
    setOrderCurrency(asString(orden.moneda, "MXN"))
    setOrderExchangeRate(asString(orden.tipo_cambio_referencia, ""))
    setOrderVigenciaHasta(asString(orden.vigencia_hasta, ""))
    setOrderProformaReferencia(asString(orden.proforma_referencia, ""))
    setOrderReferenceExternal(asString(orden.referencia_externa, ""))
    setOrderObservations(asString(orden.observaciones, ""))
    setOrderInstructions(asString(orden.instrucciones_entrega, ""))
    const comercial = (orden.condiciones_comerciales as AnyRecord | undefined) ?? {}
    const pago = (orden.condiciones_pago as AnyRecord | undefined) ?? {}
    const logistica = (orden.logistica as AnyRecord | undefined) ?? {}
    setOrderIncotermCodigo(asString(comercial.incoterm_codigo, ""))
    setOrderIncotermVersion(asString(comercial.incoterm_version, "2020"))
    setOrderLugarIncoterm(asString(comercial.lugar_incoterm, ""))
    setOrderResponsableFlete(asString(comercial.responsable_flete, ""))
    setOrderResponsableSeguro(asString(comercial.responsable_seguro, ""))
    setOrderResponsableDespachoExportacion(asString(comercial.responsable_despacho_exportacion, ""))
    setOrderResponsableDespachoImportacion(asString(comercial.responsable_despacho_importacion, ""))
    setOrderResponsableImpuestosImportacion(asString(comercial.responsable_impuestos_importacion, ""))
    setOrderPermiteEmbarquesParciales(Boolean(comercial.permite_embarques_parciales ?? true))
    setOrderPermiteTransbordos(Boolean(comercial.permite_transbordos ?? true))
    setOrderGastosBancarios(asString(comercial.gastos_bancarios, ""))
    setOrderCondicionesComercialesObservaciones(asString(comercial.observaciones, ""))
    setOrderFormaPago(asString(pago.forma_pago, ""))
    setOrderPorcentajeAnticipo(asString(pago.porcentaje_anticipo, ""))
    setOrderMontoAnticipo(asString(pago.monto_anticipo, ""))
    setOrderPorcentajeSaldo(asString(pago.porcentaje_saldo, ""))
    setOrderMontoSaldo(asString(pago.monto_saldo, ""))
    setOrderMomentoPagoSaldo(asString(pago.momento_pago_saldo, ""))
    setOrderDiasCredito(asString(pago.dias_credito, ""))
    setOrderComisionesBancarias(asString(pago.comisiones_bancarias, ""))
    setOrderCondicionesPagoObservaciones(asString(pago.observaciones, ""))
    setOrderModoTransporteCodigo(asString(logistica.modo_transporte_codigo, ""))
    setOrderFechaRequeridaEmbarque(asString(logistica.fecha_requerida_embarque, ""))
    setOrderFechaEstimadaEmbarque(asString(logistica.fecha_estimada_embarque, ""))
    setOrderFechaEstimadaArribo(asString(logistica.fecha_estimada_arribo, ""))
    setOrderPuertoOrigen(asString(logistica.puerto_origen, ""))
    setOrderPuertoDestino(asString(logistica.puerto_destino, ""))
    setOrderAeropuertoOrigen(asString(logistica.aeropuerto_origen, ""))
    setOrderAeropuertoDestino(asString(logistica.aeropuerto_destino, ""))
    setOrderLugarEntregaFinal(asString(logistica.lugar_entrega_final, ""))
    setOrderDireccionEntrega(asString(logistica.direccion_entrega, ""))
    setOrderTipoEmbarque(asString(logistica.tipo_embarque, ""))
    setOrderTipoContenedor(asString(logistica.tipo_contenedor, ""))
    setOrderForwarderNombre(asString(logistica.forwarder_nombre, ""))
    setOrderNumeroBooking(asString(logistica.numero_booking, ""))
    setOrderNumeroBlAwb(asString(logistica.numero_bl_awb, ""))
    setOrderTracking(asString(logistica.tracking, ""))
    setOrderPesoNetoTotal(asString(logistica.peso_neto_total, ""))
    setOrderPesoBrutoTotal(asString(logistica.peso_bruto_total, ""))
    setOrderVolumenTotalCbm(asString(logistica.volumen_total_cbm, ""))
    setOrderCantidadBultos(asString(logistica.cantidad_bultos, ""))
    setOrderTipoEmpaque(asString(logistica.tipo_empaque, ""))
    setOrderMarcasEmbarque(asString(logistica.marcas_embarque, ""))
    setOrderRequiereSeguro(Boolean(logistica.requiere_seguro ?? false))
    setOrderMontoAsegurado(asString(logistica.monto_asegurado, ""))
    setOrderLogisticaObservaciones(asString(logistica.observaciones, ""))
    setOrderLines(buildOrderLinesFromOrder(orden))
  }

  const clearOrderForm = () => {
    setEditingOrderId(null)
    setOrderFolio(defaultOrderFolio)
    setOrderProviderId(String(proveedores[0]?.id ?? ""))
    setOrderWarehouseId(defaultWarehouseId)
    setOrderEmissionIso(defaultOrderEmissionIso)
    setOrderDueDate("")
    setOrderType("nacional")
    setOrderCurrency("MXN")
    setOrderExchangeRate("")
    setOrderVigenciaHasta("")
    setOrderProformaReferencia("")
    setOrderReferenceExternal("")
    setOrderObservations("")
    setOrderInstructions("")
    setOrderIncotermCodigo("")
    setOrderIncotermVersion("2020")
    setOrderLugarIncoterm("")
    setOrderResponsableFlete("")
    setOrderResponsableSeguro("")
    setOrderResponsableDespachoExportacion("")
    setOrderResponsableDespachoImportacion("")
    setOrderResponsableImpuestosImportacion("")
    setOrderPermiteEmbarquesParciales(true)
    setOrderPermiteTransbordos(true)
    setOrderGastosBancarios("")
    setOrderCondicionesComercialesObservaciones("")
    setOrderFormaPago("")
    setOrderPorcentajeAnticipo("")
    setOrderMontoAnticipo("")
    setOrderPorcentajeSaldo("")
    setOrderMontoSaldo("")
    setOrderMomentoPagoSaldo("")
    setOrderDiasCredito("")
    setOrderComisionesBancarias("")
    setOrderCondicionesPagoObservaciones("")
    setOrderModoTransporteCodigo("")
    setOrderFechaRequeridaEmbarque("")
    setOrderFechaEstimadaEmbarque("")
    setOrderFechaEstimadaArribo("")
    setOrderPuertoOrigen("")
    setOrderPuertoDestino("")
    setOrderAeropuertoOrigen("")
    setOrderAeropuertoDestino("")
    setOrderLugarEntregaFinal("")
    setOrderDireccionEntrega("")
    setOrderTipoEmbarque("")
    setOrderTipoContenedor("")
    setOrderForwarderNombre("")
    setOrderNumeroBooking("")
    setOrderNumeroBlAwb("")
    setOrderTracking("")
    setOrderPesoNetoTotal("")
    setOrderPesoBrutoTotal("")
    setOrderVolumenTotalCbm("")
    setOrderCantidadBultos("")
    setOrderTipoEmpaque("")
    setOrderMarcasEmbarque("")
    setOrderRequiereSeguro(false)
    setOrderMontoAsegurado("")
    setOrderLogisticaObservaciones("")
    setOrderLines([createEmptyOrderLine()])
  }

  const clearProviderForm = () => {
    setEditingProviderId(null)
    setProviderFormCode(defaultProviderCode)
    setProviderFormName("")
    setProviderFormCommercialName("")
    setProviderFormEmail("")
    setProviderFormPhone("")
    setProviderFormTax("")
    setProviderFormPayDays("")
    setProviderFormLeadDays("")
    setProviderFormActive(true)
  }

  const handleSelectOrder = (orderId: string) => {
    setSelectedOrderId(orderId)
    const currentOrder = openOrders.find((orden) => String(orden.id) === orderId) ?? null
    setLines(buildLinesFromOrder(currentOrder))
    setSelectedWarehouseId((currentOrder?.almacen_destino_id as string | undefined) || defaultWarehouseId)
  }

  const showResumen = activeView === "resumen"
  const showAlmacenes = activeView === "almacenes"
  const showProveedores = activeView === "proveedores"
  const showOrdenes = activeView === "ordenes"
  const showInventario = activeView === "inventario"
  const showRecepciones = activeView === "recepciones"
  const rootGridClassName = showResumen ? "grid gap-4 xl:grid-cols-3" : "grid gap-4"

  return (
    <div className={rootGridClassName}>
      {showAlmacenes ? (
      <Card>
        <CardHeader>
          <CardTitle>Alta rápida de almacén</CardTitle>
          <CardDescription>Crea un almacén con datos simples y claros.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={warehouseFormAction} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="almacen-codigo">
                  Código automático
                </label>
                <Input
                  id="almacen-codigo"
                  name="codigo"
                  placeholder="AL-001"
                  readOnly
                  className="bg-muted/40"
                  value={warehouseFormCode}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
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
              <div className="space-y-2 md:col-span-1">
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
            </div>
            <div className="grid gap-3 md:grid-cols-4">
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
      ) : null}

      {showProveedores ? (
      <Card>
        <CardHeader>
          <CardTitle>Alta rápida de proveedor</CardTitle>
          <CardDescription>Registra un proveedor para poder generar órdenes de compra.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={providerFormAction} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-6">
              <div className="space-y-2 md:col-span-1">
                <label className="text-sm font-medium" htmlFor="proveedor-codigo">
                  Código automático
                </label>
                <Input
                  id="proveedor-codigo"
                  name="codigo_proveedor"
                  value={providerFormCode}
                  readOnly
                  placeholder="Prov-001"
                  className="bg-muted/40"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium" htmlFor="proveedor-razon">
                  Razón social
                </label>
                <Input id="proveedor-razon" name="razon_social" value={providerFormName} onChange={(event) => setProviderFormName(event.target.value)} placeholder="Proveedor SA de CV" required />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium" htmlFor="proveedor-comercial">
                  Nombre comercial
                </label>
                <Input id="proveedor-comercial" name="nombre_comercial" value={providerFormCommercialName} onChange={(event) => setProviderFormCommercialName(event.target.value)} placeholder="Proveedor visible" />
              </div>
              <div className="space-y-2 md:col-span-1">
                <label className="text-sm font-medium" htmlFor="proveedor-rfc">
                  RFC
                </label>
                <Input id="proveedor-rfc" name="rfc" value={providerFormTax} onChange={(event) => setProviderFormTax(event.target.value)} placeholder="RFC del proveedor" />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium" htmlFor="proveedor-correo">
                  Correo
                </label>
                <Input id="proveedor-correo" name="correo" type="email" value={providerFormEmail} onChange={(event) => setProviderFormEmail(event.target.value)} placeholder="ventas@proveedor.com" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium" htmlFor="proveedor-telefono">
                  Teléfono
                </label>
                <Input id="proveedor-telefono" name="telefono" value={providerFormPhone} onChange={(event) => setProviderFormPhone(event.target.value)} placeholder="55 5555 5555" />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium" htmlFor="proveedor-plazo-pago">
                  Plazo pago
                </label>
                <Input id="proveedor-plazo-pago" name="plazo_pago_dias" type="number" min="0" value={providerFormPayDays} onChange={(event) => setProviderFormPayDays(event.target.value)} placeholder="30" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium" htmlFor="proveedor-plazo-entrega">
                  Plazo entrega
                </label>
                <Input id="proveedor-plazo-entrega" name="plazo_entrega_dias" type="number" min="0" value={providerFormLeadDays} onChange={(event) => setProviderFormLeadDays(event.target.value)} placeholder="5" />
              </div>
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
      ) : null}

      {showOrdenes ? (
      <Card>
        <CardHeader>
          <CardTitle>{editingOrderId ? "Editar orden de compra" : "Crear orden de compra"}</CardTitle>
          <CardDescription>Selecciona proveedor, almacén y productos. Todo se guarda en una sola operación.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={orderFormAction} className="space-y-5">
            <input type="hidden" name="fecha_emision" value={orderEmissionIso} readOnly />
            <div className="grid gap-4 md:grid-cols-6">
              <div className="space-y-2 md:col-span-1">
                <label className="text-sm font-medium" htmlFor="orden-folio">
                  Folio
                </label>
                <Input
                  id="orden-folio"
                  name="folio"
                  value={orderFolio}
                  readOnly
                  className="bg-muted/40 font-mono"
                  placeholder="OC-20260522-001"
                />
              </div>
              <div className="space-y-2 md:col-span-1">
                <label className="text-sm font-medium" htmlFor="orden-tipo-operacion">
                  Tipo de operación
                </label>
                <select
                  id="orden-tipo-operacion"
                  name="tipo_operacion"
                  value={orderType}
                  onChange={(event) => setOrderType(event.target.value as "nacional" | "internacional")}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="nacional">Nacional</option>
                  <option value="internacional">Internacional</option>
                </select>
              </div>
              <div className="space-y-2 md:col-span-1">
                <label className="text-sm font-medium" htmlFor="orden-moneda">
                  Moneda
                </label>
                <ContactCatalogSelect
                  value={orderCurrency}
                  onValueChange={(value) => setOrderCurrency(value)}
                  options={monedasOptions}
                  placeholder="Selecciona moneda"
                  emptyLabel="Sin monedas configuradas"
                />
                <input type="hidden" name="moneda" value={orderCurrency} readOnly />
              </div>
              <div className="space-y-2 md:col-span-1">
                <label className="text-sm font-medium" htmlFor="orden-tipo-cambio">
                  Tipo de cambio
                </label>
                <Input
                  id="orden-tipo-cambio"
                  name="tipo_cambio_referencia"
                  type="number"
                  min="0"
                  step="0.000001"
                  value={orderExchangeRate}
                  onChange={(event) => setOrderExchangeRate(event.target.value)}
                  placeholder="Opcional"
                />
              </div>
              <div className="space-y-2 md:col-span-1">
                <label className="text-sm font-medium" htmlFor="orden-entrega">
                  Fecha estimada
                </label>
                <Input id="orden-entrega" name="fecha_entrega_estimada" type="date" value={orderDueDate} onChange={(event) => setOrderDueDate(event.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-1">
                <label className="text-sm font-medium" htmlFor="orden-instrucciones">
                  Instrucciones
                </label>
                <Input id="orden-instrucciones" name="instrucciones_entrega" value={orderInstructions} onChange={(event) => setOrderInstructions(event.target.value)} placeholder="Horario, recepción..." />
              </div>
              <div className="space-y-2 md:col-span-3">
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
              <div className="space-y-2 md:col-span-3">
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
              <div className="space-y-2 md:col-span-3">
                <label className="text-sm font-medium" htmlFor="orden-ref">
                  Referencia externa
                </label>
                <Input id="orden-ref" name="referencia_externa" value={orderReferenceExternal} onChange={(event) => setOrderReferenceExternal(event.target.value)} placeholder="Cotización, solicitud..." />
              </div>
              <div className="space-y-2 md:col-span-3">
                <label className="text-sm font-medium" htmlFor="orden-notas">
                  Observaciones
                </label>
                <Input id="orden-notas" name="observaciones" value={orderObservations} onChange={(event) => setOrderObservations(event.target.value)} placeholder="Notas para compras" />
              </div>
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Condiciones de la orden y pago</div>
                  <div className="text-xs text-muted-foreground">Moneda única, condiciones comerciales y forma de pago en una sola sección.</div>
                </div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  {orderType === "internacional" ? "Internacional" : "Nacional"}
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-6">
                <div className="space-y-2 md:col-span-1">
                  <label className="text-sm font-medium" htmlFor="orden-vigencia">
                    Vigencia hasta
                  </label>
                  <Input
                    id="orden-vigencia"
                    name="vigencia_hasta"
                    type="date"
                    value={orderVigenciaHasta}
                    onChange={(event) => setOrderVigenciaHasta(event.target.value)}
                  />
                </div>
                <div className="space-y-2 md:col-span-1">
                  <label className="text-sm font-medium" htmlFor="orden-proforma">
                    Proforma
                  </label>
                  <Input
                    id="orden-proforma"
                    name="proforma_referencia"
                    value={orderProformaReferencia}
                    onChange={(event) => setOrderProformaReferencia(event.target.value)}
                    placeholder="PI-12345"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="orden-incoterm">
                    Incoterm
                  </label>
                  <ContactCatalogSelect
                    value={orderIncotermCodigo}
                    onValueChange={(value) => setOrderIncotermCodigo(value)}
                    options={incotermsOptions}
                    placeholder="Selecciona un Incoterm"
                    emptyLabel="Sin incoterms configurados"
                  />
                  <input type="hidden" name="condiciones_comerciales_incoterm_codigo" value={orderIncotermCodigo} readOnly />
                </div>
                <div className="space-y-2 md:col-span-1">
                  <label className="text-sm font-medium" htmlFor="orden-incoterm-version">
                    Versión
                  </label>
                  <Input
                    id="orden-incoterm-version"
                    name="condiciones_comerciales_incoterm_version"
                    value={orderIncotermVersion}
                    readOnly
                    className="bg-muted/40"
                    placeholder="2020"
                  />
                </div>
                <div className="space-y-2 md:col-span-1">
                  <label className="text-sm font-medium" htmlFor="orden-lugar-incoterm">
                    Lugar
                  </label>
                  <Input
                    id="orden-lugar-incoterm"
                    name="condiciones_comerciales_lugar_incoterm"
                    value={orderLugarIncoterm}
                    onChange={(event) => setOrderLugarIncoterm(event.target.value)}
                    placeholder="Puerto / aeropuerto"
                  />
                </div>
              </div>
              {orderType === "internacional" ? (
                <div className="mt-4 grid gap-4 md:grid-cols-6">
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium" htmlFor="orden-resp-flete">
                      Quién paga flete
                    </label>
                    <Input
                      id="orden-resp-flete"
                      name="condiciones_comerciales_responsable_flete"
                      value={orderResponsableFlete}
                      onChange={(event) => setOrderResponsableFlete(event.target.value)}
                      placeholder="Comprador / vendedor"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium" htmlFor="orden-resp-seguro">
                      Quién paga seguro
                    </label>
                    <Input
                      id="orden-resp-seguro"
                      name="condiciones_comerciales_responsable_seguro"
                      value={orderResponsableSeguro}
                      onChange={(event) => setOrderResponsableSeguro(event.target.value)}
                      placeholder="Comprador / vendedor"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium" htmlFor="orden-resp-desp-export">
                      Despacho exportación
                    </label>
                    <Input
                      id="orden-resp-desp-export"
                      name="condiciones_comerciales_responsable_despacho_exportacion"
                      value={orderResponsableDespachoExportacion}
                      onChange={(event) => setOrderResponsableDespachoExportacion(event.target.value)}
                      placeholder="Comprador / vendedor"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium" htmlFor="orden-resp-desp-import">
                      Despacho importación
                    </label>
                    <Input
                      id="orden-resp-desp-import"
                      name="condiciones_comerciales_responsable_despacho_importacion"
                      value={orderResponsableDespachoImportacion}
                      onChange={(event) => setOrderResponsableDespachoImportacion(event.target.value)}
                      placeholder="Comprador / vendedor"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium" htmlFor="orden-resp-impuestos">
                      Impuestos importación
                    </label>
                    <Input
                      id="orden-resp-impuestos"
                      name="condiciones_comerciales_responsable_impuestos_importacion"
                      value={orderResponsableImpuestosImportacion}
                      onChange={(event) => setOrderResponsableImpuestosImportacion(event.target.value)}
                      placeholder="Comprador / vendedor"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium" htmlFor="orden-gastos-bancarios">
                      Gastos bancarios
                    </label>
                    <Input
                      id="orden-gastos-bancarios"
                      name="condiciones_comerciales_gastos_bancarios"
                      value={orderGastosBancarios}
                      onChange={(event) => setOrderGastosBancarios(event.target.value)}
                      placeholder="OUR / SHA / BEN"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm md:col-span-3">
                    <input
                      type="checkbox"
                      name="condiciones_comerciales_permite_embarques_parciales"
                      checked={orderPermiteEmbarquesParciales}
                      onChange={(event) => setOrderPermiteEmbarquesParciales(event.target.checked)}
                    />
                    Permite embarques parciales
                  </label>
                  <label className="flex items-center gap-2 text-sm md:col-span-3">
                    <input
                      type="checkbox"
                      name="condiciones_comerciales_permite_transbordos"
                      checked={orderPermiteTransbordos}
                      onChange={(event) => setOrderPermiteTransbordos(event.target.checked)}
                    />
                    Permite transbordos
                  </label>
                </div>
              ) : null}
              <div className="mt-4 grid gap-4 md:grid-cols-6">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="orden-forma-pago">
                    Forma de pago
                  </label>
                  <Input
                    id="orden-forma-pago"
                    name="condiciones_pago_forma_pago"
                    value={orderFormaPago}
                    onChange={(event) => setOrderFormaPago(event.target.value)}
                    placeholder="Transferencia / carta de crédito"
                  />
                </div>
                <div className="space-y-2 md:col-span-1">
                  <label className="text-sm font-medium" htmlFor="orden-porcentaje-anticipo">
                    % anticipo
                  </label>
                  <Input
                    id="orden-porcentaje-anticipo"
                    name="condiciones_pago_porcentaje_anticipo"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={orderPorcentajeAnticipo}
                    onChange={(event) => setOrderPorcentajeAnticipo(event.target.value)}
                  />
                </div>
                <div className="space-y-2 md:col-span-1">
                  <label className="text-sm font-medium" htmlFor="orden-monto-anticipo">
                    Monto anticipo
                  </label>
                  <Input
                    id="orden-monto-anticipo"
                    name="condiciones_pago_monto_anticipo"
                    type="number"
                    min="0"
                    step="0.01"
                    value={orderMontoAnticipo}
                    onChange={(event) => setOrderMontoAnticipo(event.target.value)}
                  />
                </div>
                <div className="space-y-2 md:col-span-1">
                  <label className="text-sm font-medium" htmlFor="orden-porcentaje-saldo">
                    % saldo
                  </label>
                  <Input
                    id="orden-porcentaje-saldo"
                    name="condiciones_pago_porcentaje_saldo"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={orderPorcentajeSaldo}
                    onChange={(event) => setOrderPorcentajeSaldo(event.target.value)}
                  />
                </div>
                <div className="space-y-2 md:col-span-1">
                  <label className="text-sm font-medium" htmlFor="orden-monto-saldo">
                    Monto saldo
                  </label>
                  <Input
                    id="orden-monto-saldo"
                    name="condiciones_pago_monto_saldo"
                    type="number"
                    min="0"
                    step="0.01"
                    value={orderMontoSaldo}
                    onChange={(event) => setOrderMontoSaldo(event.target.value)}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="orden-momento-saldo">
                    Momento pago saldo
                  </label>
                  <Input
                    id="orden-momento-saldo"
                    name="condiciones_pago_momento_pago_saldo"
                    value={orderMomentoPagoSaldo}
                    onChange={(event) => setOrderMomentoPagoSaldo(event.target.value)}
                    placeholder="Contra BL / antes de embarque"
                  />
                </div>
                <div className="space-y-2 md:col-span-1">
                  <label className="text-sm font-medium" htmlFor="orden-dias-credito">
                    Días crédito
                  </label>
                  <Input
                    id="orden-dias-credito"
                    name="condiciones_pago_dias_credito"
                    type="number"
                    min="0"
                    step="1"
                    value={orderDiasCredito}
                    onChange={(event) => setOrderDiasCredito(event.target.value)}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="orden-comisiones-bancarias">
                    Comisiones bancarias
                  </label>
                  <Input
                    id="orden-comisiones-bancarias"
                    name="condiciones_pago_comisiones_bancarias"
                    value={orderComisionesBancarias}
                    onChange={(event) => setOrderComisionesBancarias(event.target.value)}
                    placeholder="OUR / SHA / BEN"
                  />
                </div>
                <div className="md:col-span-6 space-y-2">
                  <Label htmlFor="orden-pago-observaciones">Observaciones de pago</Label>
                  <Textarea
                    id="orden-pago-observaciones"
                    name="condiciones_pago_observaciones"
                    value={orderCondicionesPagoObservaciones}
                    onChange={(event) => setOrderCondicionesPagoObservaciones(event.target.value)}
                    rows={3}
                  />
                </div>
              </div>
            </div>
            <div className="grid gap-4 rounded-xl border border-border/70 bg-muted/10 p-4 md:grid-cols-6">
              <div className="space-y-2">
                <div className="text-sm font-semibold">Logística y embarque</div>
                <div className="text-xs text-muted-foreground">Fechas, modo de transporte y datos de envío.</div>
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium" htmlFor="orden-modo-transporte">
                  Modo de transporte
                </label>
                <ContactCatalogSelect
                  value={orderModoTransporteCodigo}
                  onValueChange={(value) => setOrderModoTransporteCodigo(value)}
                  options={modosTransporteOptions}
                  placeholder="Selecciona un modo"
                  emptyLabel="Sin modos de transporte configurados"
                />
                <input type="hidden" name="logistica_modo_transporte_codigo" value={orderModoTransporteCodigo} readOnly />
              </div>
              <div className="grid gap-3 md:grid-cols-6 md:col-span-6">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="orden-fecha-embarque">
                    Fecha requerida embarque
                  </label>
                  <Input
                    id="orden-fecha-embarque"
                    name="logistica_fecha_requerida_embarque"
                    type="date"
                    value={orderFechaRequeridaEmbarque}
                    onChange={(event) => setOrderFechaRequeridaEmbarque(event.target.value)}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="orden-fecha-estimada-embarque">
                    Fecha estimada embarque
                  </label>
                  <Input
                    id="orden-fecha-estimada-embarque"
                    name="logistica_fecha_estimada_embarque"
                    type="date"
                    value={orderFechaEstimadaEmbarque}
                    onChange={(event) => setOrderFechaEstimadaEmbarque(event.target.value)}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="orden-fecha-arribo">
                    Fecha estimada arribo
                  </label>
                  <Input
                    id="orden-fecha-arribo"
                    name="logistica_fecha_estimada_arribo"
                    type="date"
                    value={orderFechaEstimadaArribo}
                    onChange={(event) => setOrderFechaEstimadaArribo(event.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-6 md:col-span-6">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="orden-puerto-origen">
                    Puerto origen
                  </label>
                  <Input id="orden-puerto-origen" name="logistica_puerto_origen" value={orderPuertoOrigen} onChange={(event) => setOrderPuertoOrigen(event.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="orden-puerto-destino">
                    Puerto destino
                  </label>
                  <Input id="orden-puerto-destino" name="logistica_puerto_destino" value={orderPuertoDestino} onChange={(event) => setOrderPuertoDestino(event.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="orden-aeropuerto-origen">
                    Aeropuerto origen
                  </label>
                  <Input id="orden-aeropuerto-origen" name="logistica_aeropuerto_origen" value={orderAeropuertoOrigen} onChange={(event) => setOrderAeropuertoOrigen(event.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="orden-aeropuerto-destino">
                    Aeropuerto destino
                  </label>
                  <Input id="orden-aeropuerto-destino" name="logistica_aeropuerto_destino" value={orderAeropuertoDestino} onChange={(event) => setOrderAeropuertoDestino(event.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-3">
                  <label className="text-sm font-medium" htmlFor="orden-lugar-entrega">
                    Lugar entrega final
                  </label>
                  <Input id="orden-lugar-entrega" name="logistica_lugar_entrega_final" value={orderLugarEntregaFinal} onChange={(event) => setOrderLugarEntregaFinal(event.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-3">
                  <label className="text-sm font-medium" htmlFor="orden-direccion-entrega">
                    Dirección entrega
                  </label>
                  <Input id="orden-direccion-entrega" name="logistica_direccion_entrega" value={orderDireccionEntrega} onChange={(event) => setOrderDireccionEntrega(event.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="orden-tipo-embarque">
                    Tipo embarque
                  </label>
                  <Input id="orden-tipo-embarque" name="logistica_tipo_embarque" value={orderTipoEmbarque} onChange={(event) => setOrderTipoEmbarque(event.target.value)} placeholder="FCL / LCL / courier" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="orden-tipo-contenedor">
                    Tipo contenedor
                  </label>
                  <Input id="orden-tipo-contenedor" name="logistica_tipo_contenedor" value={orderTipoContenedor} onChange={(event) => setOrderTipoContenedor(event.target.value)} placeholder="20' / 40' / etc." />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="orden-forwarder">
                    Forwarder
                  </label>
                  <Input id="orden-forwarder" name="logistica_forwarder_nombre" value={orderForwarderNombre} onChange={(event) => setOrderForwarderNombre(event.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="orden-booking">
                    Booking
                  </label>
                  <Input id="orden-booking" name="logistica_numero_booking" value={orderNumeroBooking} onChange={(event) => setOrderNumeroBooking(event.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="orden-bl-awb">
                    BL / AWB
                  </label>
                  <Input id="orden-bl-awb" name="logistica_numero_bl_awb" value={orderNumeroBlAwb} onChange={(event) => setOrderNumeroBlAwb(event.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="orden-tracking">
                    Tracking
                  </label>
                  <Input id="orden-tracking" name="logistica_tracking" value={orderTracking} onChange={(event) => setOrderTracking(event.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="orden-peso-neto">
                    Peso neto total
                  </label>
                  <Input id="orden-peso-neto" name="logistica_peso_neto_total" type="number" min="0" step="0.0001" value={orderPesoNetoTotal} onChange={(event) => setOrderPesoNetoTotal(event.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="orden-peso-bruto">
                    Peso bruto total
                  </label>
                  <Input id="orden-peso-bruto" name="logistica_peso_bruto_total" type="number" min="0" step="0.0001" value={orderPesoBrutoTotal} onChange={(event) => setOrderPesoBrutoTotal(event.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="orden-volumen">
                    Volumen total CBM
                  </label>
                  <Input id="orden-volumen" name="logistica_volumen_total_cbm" type="number" min="0" step="0.0001" value={orderVolumenTotalCbm} onChange={(event) => setOrderVolumenTotalCbm(event.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="orden-bultos">
                    Cantidad bultos
                  </label>
                  <Input id="orden-bultos" name="logistica_cantidad_bultos" type="number" min="0" step="1" value={orderCantidadBultos} onChange={(event) => setOrderCantidadBultos(event.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="orden-empaque">
                    Tipo empaque
                  </label>
                  <Input id="orden-empaque" name="logistica_tipo_empaque" value={orderTipoEmpaque} onChange={(event) => setOrderTipoEmpaque(event.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="orden-marcas">
                    Marcas embarque
                  </label>
                  <Input id="orden-marcas" name="logistica_marcas_embarque" value={orderMarcasEmbarque} onChange={(event) => setOrderMarcasEmbarque(event.target.value)} />
                </div>
                <label className="flex items-center gap-2 text-sm md:col-span-2">
                  <input
                    type="checkbox"
                    name="logistica_requiere_seguro"
                    checked={orderRequiereSeguro}
                    onChange={(event) => setOrderRequiereSeguro(event.target.checked)}
                  />
                  Requiere seguro
                </label>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="orden-monto-asegurado">
                    Monto asegurado
                  </label>
                  <Input id="orden-monto-asegurado" name="logistica_monto_asegurado" type="number" min="0" step="0.01" value={orderMontoAsegurado} onChange={(event) => setOrderMontoAsegurado(event.target.value)} />
                </div>
                <div className="md:col-span-6 space-y-2">
                  <Label htmlFor="orden-logistica-observaciones">Observaciones logísticas</Label>
                  <Textarea
                    id="orden-logistica-observaciones"
                    name="logistica_observaciones"
                    value={orderLogisticaObservaciones}
                    onChange={(event) => setOrderLogisticaObservaciones(event.target.value)}
                    rows={3}
                  />
                </div>
              </div>
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
                          {orderType === "internacional" ? (
                            <div className="mt-3 rounded-lg border border-dashed border-border/70 bg-background/60 p-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                  Datos internacionales
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    setExpandedOrderLineIndex((current) => (current === index ? null : index))
                                  }
                                >
                                  {expandedOrderLineIndex === index ? "Ocultar" : "Editar"}
                                </Button>
                              </div>
                              <div className={expandedOrderLineIndex === index ? "mt-3 grid gap-3 md:grid-cols-4" : "hidden"}>
                                <div className="space-y-2 md:col-span-1">
                                  <label className="text-xs font-medium" htmlFor={`item-numero-partida-${index}`}>
                                    Número de partida
                                  </label>
                                  <Input
                                    id={`item-numero-partida-${index}`}
                                    name="items_numero_partida"
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={line.numero_partida}
                                    onChange={(event) => updateOrderLine(index, { numero_partida: event.target.value })}
                                  />
                                </div>
                                <div className="space-y-2 md:col-span-4">
                                  <label className="text-xs font-medium" htmlFor={`item-descripcion-${index}`}>
                                    Descripción
                                  </label>
                                  <Textarea
                                    id={`item-descripcion-${index}`}
                                    name="items_descripcion"
                                    value={line.descripcion}
                                    onChange={(event) => updateOrderLine(index, { descripcion: event.target.value })}
                                    rows={2}
                                  />
                                </div>
                                <div className="space-y-2 md:col-span-1">
                                  <label className="text-xs font-medium" htmlFor={`item-marca-${index}`}>
                                    Marca
                                  </label>
                                  <Input
                                    id={`item-marca-${index}`}
                                    name="items_marca"
                                    value={line.marca}
                                    onChange={(event) => updateOrderLine(index, { marca: event.target.value })}
                                  />
                                </div>
                                <div className="space-y-2 md:col-span-1">
                                  <label className="text-xs font-medium" htmlFor={`item-modelo-${index}`}>
                                    Modelo
                                  </label>
                                  <Input
                                    id={`item-modelo-${index}`}
                                    name="items_modelo"
                                    value={line.modelo}
                                    onChange={(event) => updateOrderLine(index, { modelo: event.target.value })}
                                  />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                  <label className="text-xs font-medium" htmlFor={`item-fabricante-${index}`}>
                                    Fabricante
                                  </label>
                                  <Input
                                    id={`item-fabricante-${index}`}
                                    name="items_fabricante"
                                    value={line.fabricante}
                                    onChange={(event) => updateOrderLine(index, { fabricante: event.target.value })}
                                  />
                                </div>
                                <div className="space-y-2 md:col-span-1">
                                  <label className="text-xs font-medium">País origen</label>
                                  <ContactCatalogSelect
                                    value={line.pais_origen_codigo_iso2}
                                    onValueChange={(value) => updateOrderLine(index, { pais_origen_codigo_iso2: value })}
                                    options={mergeCatalogOptions(paisesOptions, line.pais_origen_codigo_iso2)}
                                    placeholder="Selecciona país"
                                    emptyLabel="Sin países cargados"
                                  />
                                  <input type="hidden" name="items_pais_origen_codigo_iso2" value={line.pais_origen_codigo_iso2} readOnly />
                                </div>
                                <div className="space-y-2 md:col-span-1">
                                  <label className="text-xs font-medium">País procedencia</label>
                                  <ContactCatalogSelect
                                    value={line.pais_procedencia_codigo_iso2}
                                    onValueChange={(value) => updateOrderLine(index, { pais_procedencia_codigo_iso2: value })}
                                    options={mergeCatalogOptions(paisesOptions, line.pais_procedencia_codigo_iso2)}
                                    placeholder="Selecciona país"
                                    emptyLabel="Sin países cargados"
                                  />
                                  <input type="hidden" name="items_pais_procedencia_codigo_iso2" value={line.pais_procedencia_codigo_iso2} readOnly />
                                </div>
                                <div className="space-y-2 md:col-span-1">
                                  <label className="text-xs font-medium" htmlFor={`item-fraccion-${index}`}>
                                    Fracción arancelaria
                                  </label>
                                  <Input
                                    id={`item-fraccion-${index}`}
                                    name="items_fraccion_arancelaria"
                                    value={line.fraccion_arancelaria}
                                    onChange={(event) => updateOrderLine(index, { fraccion_arancelaria: event.target.value })}
                                  />
                                </div>
                                <div className="space-y-2 md:col-span-1">
                                  <label className="text-xs font-medium" htmlFor={`item-hs-${index}`}>
                                    HS code
                                  </label>
                                  <Input
                                    id={`item-hs-${index}`}
                                    name="items_hs_code"
                                    value={line.hs_code}
                                    onChange={(event) => updateOrderLine(index, { hs_code: event.target.value })}
                                  />
                                </div>
                                <div className="space-y-2 md:col-span-1">
                                  <label className="text-xs font-medium" htmlFor={`item-nico-${index}`}>
                                    NICO
                                  </label>
                                  <Input
                                    id={`item-nico-${index}`}
                                    name="items_nico"
                                    value={line.nico}
                                    onChange={(event) => updateOrderLine(index, { nico: event.target.value })}
                                  />
                                </div>
                                <div className="space-y-2 md:col-span-1">
                                  <label className="text-xs font-medium" htmlFor={`item-peso-neto-${index}`}>
                                    Peso neto
                                  </label>
                                  <Input
                                    id={`item-peso-neto-${index}`}
                                    name="items_peso_neto"
                                    type="number"
                                    min="0"
                                    step="0.0001"
                                    value={line.peso_neto}
                                    onChange={(event) => updateOrderLine(index, { peso_neto: event.target.value })}
                                  />
                                </div>
                                <div className="space-y-2 md:col-span-1">
                                  <label className="text-xs font-medium" htmlFor={`item-peso-bruto-${index}`}>
                                    Peso bruto
                                  </label>
                                  <Input
                                    id={`item-peso-bruto-${index}`}
                                    name="items_peso_bruto"
                                    type="number"
                                    min="0"
                                    step="0.0001"
                                    value={line.peso_bruto}
                                    onChange={(event) => updateOrderLine(index, { peso_bruto: event.target.value })}
                                  />
                                </div>
                                <div className="space-y-2 md:col-span-1">
                                  <label className="text-xs font-medium" htmlFor={`item-volumen-${index}`}>
                                    Volumen CBM
                                  </label>
                                  <Input
                                    id={`item-volumen-${index}`}
                                    name="items_volumen_cbm"
                                    type="number"
                                    min="0"
                                    step="0.0001"
                                    value={line.volumen_cbm}
                                    onChange={(event) => updateOrderLine(index, { volumen_cbm: event.target.value })}
                                  />
                                </div>
                                <div className="space-y-2 md:col-span-1">
                                  <label className="text-xs font-medium" htmlFor={`item-lote-${index}`}>
                                    Lote
                                  </label>
                                  <Input
                                    id={`item-lote-${index}`}
                                    name="items_lote"
                                    value={line.lote}
                                    onChange={(event) => updateOrderLine(index, { lote: event.target.value })}
                                  />
                                </div>
                                <div className="space-y-2 md:col-span-1">
                                  <label className="text-xs font-medium" htmlFor={`item-serie-${index}`}>
                                    Número de serie
                                  </label>
                                  <Input
                                    id={`item-serie-${index}`}
                                    name="items_numero_serie"
                                    value={line.numero_serie}
                                    onChange={(event) => updateOrderLine(index, { numero_serie: event.target.value })}
                                  />
                                </div>
                                <div className="space-y-2 md:col-span-1">
                                  <label className="text-xs font-medium" htmlFor={`item-caducidad-${index}`}>
                                    Fecha caducidad
                                  </label>
                                  <Input
                                    id={`item-caducidad-${index}`}
                                    name="items_fecha_caducidad"
                                    type="date"
                                    value={line.fecha_caducidad}
                                    onChange={(event) => updateOrderLine(index, { fecha_caducidad: event.target.value })}
                                  />
                                </div>
                              </div>
                            </div>
                          ) : (
                            <>
                              <input type="hidden" name="items_numero_partida" value={line.numero_partida || String(index + 1)} readOnly />
                              <input type="hidden" name="items_descripcion" value={line.descripcion} readOnly />
                              <input type="hidden" name="items_marca" value={line.marca} readOnly />
                              <input type="hidden" name="items_modelo" value={line.modelo} readOnly />
                              <input type="hidden" name="items_fabricante" value={line.fabricante} readOnly />
                              <input type="hidden" name="items_pais_origen_codigo_iso2" value={line.pais_origen_codigo_iso2} readOnly />
                              <input type="hidden" name="items_pais_procedencia_codigo_iso2" value={line.pais_procedencia_codigo_iso2} readOnly />
                              <input type="hidden" name="items_fraccion_arancelaria" value={line.fraccion_arancelaria} readOnly />
                              <input type="hidden" name="items_hs_code" value={line.hs_code} readOnly />
                              <input type="hidden" name="items_nico" value={line.nico} readOnly />
                              <input type="hidden" name="items_peso_neto" value={line.peso_neto} readOnly />
                              <input type="hidden" name="items_peso_bruto" value={line.peso_bruto} readOnly />
                              <input type="hidden" name="items_volumen_cbm" value={line.volumen_cbm} readOnly />
                              <input type="hidden" name="items_lote" value={line.lote} readOnly />
                              <input type="hidden" name="items_numero_serie" value={line.numero_serie} readOnly />
                              <input type="hidden" name="items_fecha_caducidad" value={line.fecha_caducidad} readOnly />
                            </>
                          )}
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
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={!orderLines.length || !orderProviderId || !orderWarehouseId}>
                {editingOrderId ? "Actualizar orden de compra" : "Guardar orden de compra"}
              </Button>
              {editingOrderId ? (
                <Button type="button" variant="outline" onClick={clearOrderForm}>
                  Cancelar edición
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>
      ) : null}

      {showRecepciones ? (
      <Card>
        <CardHeader>
          <CardTitle>Registrar recepción</CardTitle>
          <CardDescription>
            El operador selecciona una orden y ajusta cantidades. No ve JSON ni estructuras técnicas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createRecepcionAction} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="recepcion-orden">
                  Orden de compra
                </label>
                <select
                  id="recepcion-orden"
                  name="orden_compra_id"
                  value={selectedOrderId}
                  onChange={(event) => handleSelectOrder(event.target.value)}
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
            </div>

            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2 md:col-span-2">
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
              <div className="space-y-2 md:col-span-2">
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
      ) : null}

      {showResumen ? (
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
      ) : null}

      {showInventario ? (
      <Card>
        <CardHeader>
          <CardTitle>Ajuste manual de inventario</CardTitle>
          <CardDescription>Corrige stock real con una entrada o salida simple y auditada.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createInventarioAjusteAction} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="ajuste-almacen">
                  Almacén
                </label>
                <select
                  id="ajuste-almacen"
                  name="almacen_id"
                  value={adjustmentWarehouseId}
                  onChange={(event) => setAdjustmentWarehouseId(event.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  required
                >
                  <option value="">Selecciona un almacén</option>
                  {almacenes.map((almacen) => (
                    <option key={String(almacen.id)} value={String(almacen.id)}>
                      {asString(almacen.codigo)} · {asString(almacen.nombre)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="ajuste-producto">
                  Producto
                </label>
                <select
                  id="ajuste-producto"
                  name="catalog_item_id"
                  value={adjustmentCatalogItemId}
                  onChange={(event) => setAdjustmentCatalogItemId(event.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  required
                >
                  <option value="">Selecciona un producto</option>
                  {catalogItems.map((item) => (
                    <option key={String(item.id)} value={String(item.id)}>
                      {asString(item.nombre)} · {asString(item.unidad, "unidad")}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="ajuste-sentido">
                  Tipo de ajuste
                </label>
                <select
                  id="ajuste-sentido"
                  name="sentido"
                  value={adjustmentSentido}
                  onChange={(event) => setAdjustmentSentido(event.target.value as "entrada" | "salida")}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="entrada">Entrada</option>
                  <option value="salida">Salida</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="ajuste-cantidad">
                  Cantidad
                </label>
                <Input
                  id="ajuste-cantidad"
                  name="cantidad"
                  type="number"
                  min="0"
                  step="0.001"
                  value={adjustmentCantidad}
                  onChange={(event) => setAdjustmentCantidad(event.target.value)}
                  placeholder="0.000"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="ajuste-stock-actual">
                  Stock actual
                </label>
                <Input
                  id="ajuste-stock-actual"
                  value={Number.isFinite(asNumber(adjustmentExistencia?.stock_actual)) ? asNumber(adjustmentExistencia?.stock_actual).toFixed(3) : "0.000"}
                  readOnly
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="ajuste-motivo">
                Motivo
              </label>
              <Input
                id="ajuste-motivo"
                name="motivo"
                value={adjustmentMotivo}
                onChange={(event) => setAdjustmentMotivo(event.target.value)}
                placeholder="Conteo físico, merma, corrección..."
              />
            </div>
            <Button type="submit" className="w-full" disabled={!adjustmentWarehouseId || !adjustmentCatalogItemId || !adjustmentCantidad}>
              Aplicar ajuste
            </Button>
          </form>
        </CardContent>
      </Card>
      ) : null}

      {showInventario ? (
      <Card>
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
      ) : null}

      {showOrdenes ? (
      <Card>
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
                  <TableHead>Auditoría</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
            <TableBody>
              {!ordenes.length ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    Aún no hay órdenes de compra registradas.
                  </TableCell>
                </TableRow>
              ) : (
                ordenes.map((orden) => (
                  <TableRow key={String(orden.id)}>
                    <TableCell className="font-mono text-xs">{asString(orden.folio)}</TableCell>
                    <TableCell>{asString((orden.proveedor as AnyRecord | undefined)?.razon_social ?? (orden.proveedor as AnyRecord | undefined)?.nombre_comercial, "Proveedor")}</TableCell>
                    <TableCell>{asString((orden.almacen as AnyRecord | undefined)?.nombre, "Almacén")}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${getOrderStatusBadge(
                          orden.estado,
                        ).className}`}
                      >
                        {getOrderStatusBadge(orden.estado).label}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-xs">
                        <div className="space-y-0.5">
                          <div className="font-medium text-foreground">Enviado</div>
                          <div>{getAuditLabel(orden.enviada_por_usuario)}</div>
                          <div className="text-[11px] text-muted-foreground">{formatDateTime(orden.enviada_en)}</div>
                        </div>
                        <div className="space-y-0.5">
                          <div className="font-medium text-foreground">Aprobado</div>
                          <div>{getAuditLabel(orden.aprobado_por_usuario)}</div>
                          <div className="text-[11px] text-muted-foreground">{formatDateTime(orden.aprobada_en)}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{formatDateTime(orden.fecha_emision)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(orden.total)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {String(orden.estado ?? "").toLowerCase() === "borrador" ? (
                          <form action={sendOrdenCompraAction.bind(null, String(orden.id))}>
                            <Button type="submit" variant="secondary" size="sm">
                              Enviar
                            </Button>
                          </form>
                        ) : null}
                        {String(orden.estado ?? "").toLowerCase() === "enviada" ? (
                          <form action={approveOrdenCompraAction.bind(null, String(orden.id))}>
                            <Button type="submit" variant="secondary" size="sm">
                              Aprobar
                            </Button>
                          </form>
                        ) : null}
                        {String(orden.estado ?? "").toLowerCase() === "recibida" ? (
                          <form action={closeOrdenCompraAction.bind(null, String(orden.id))}>
                            <Button type="submit" variant="secondary" size="sm">
                              Cerrar
                            </Button>
                          </form>
                        ) : null}
                        {String(orden.estado ?? "").toLowerCase() !== "cancelada" ? (
                          <Button type="button" variant="outline" size="sm" onClick={() => startEditOrder(orden)}>
                            Editar
                          </Button>
                        ) : null}
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
      ) : null}

      {showRecepciones ? (
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
      ) : null}
    </div>
  )
}
