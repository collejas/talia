"use client"

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Info, Paperclip } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ContactCatalogSelect, mergeCatalogOptions } from "@/components/contactos/contact-catalog-select"
import { PedimentosImportacionPanel } from "./pedimentos-importacion-panel.client"

import {
  createAlmacenAction,
  createInventarioAjusteAction,
  createOrdenCompraAction,
  createProveedorAction,
  createRecepcionAction,
  approveOrdenCompraAction,
  deleteOrdenCompraDocumentoAction,
  saveOrdenCompraPagosProgramadosAction,
  updateOrdenCompraPagoProgramadoAction,
  deleteOrdenCompraPagoProgramadoAction,
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
  agentesAduanales: AnyRecord[]
  pedimentosImportacion: AnyRecord[]
  selectedPedimento: AnyRecord | null
  selectedPedimentoId: string
  defaultOrderId: string
  defaultWarehouseId: string
  defaultWarehouseCode: string
  defaultProviderCode: string
  defaultReceptionNumber: string
  defaultOrderFolio: string
  defaultOrderEmissionIso: string
  defaultPaymentOrderId: string
  activeView: "resumen" | "almacenes" | "proveedores" | "ordenes" | "pedimentos" | "agentes" | "inventario" | "recepciones" | "pagos"
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

type OrderPaymentScheduleLine = {
  tipo_pago: "anticipo" | "saldo" | "parcial"
  evento_base: string
  porcentaje: string
  monto: string
  moneda_codigo: string
  tipo_cambio_aplicado?: string | number
  monto_mxn?: string | number
  dias_credito: string
  fecha_vencimiento_calculada: string
  fecha_evento_real: string
  fecha_pago_real: string
  referencia_pago: string
  estado: "programado" | "pendiente" | "parcial" | "pagado" | "vencido" | "cancelado"
  observaciones: string
}

type PaymentMxnLookupState = {
  loading: boolean
  tipoCambio: string
  montoMxn: string
  fechaTipoCambio: string
}

type PaymentScheduleRecordDraft = {
  id: string
  tipo_pago: OrderPaymentScheduleLine["tipo_pago"]
  evento_base: string
  porcentaje: string
  monto: string
  moneda_codigo: string
  dias_credito: string
  fecha_vencimiento_calculada: string
  fecha_evento_real: string
  fecha_pago_real: string
  referencia_pago: string
  estado: OrderPaymentScheduleLine["estado"]
  observaciones: string
}

type OrderDocumentDefinition = {
  tipoDocumento: string
  label: string
  help: string
  appliesTo: "nacional" | "internacional" | "ambos"
  requiredByDefault?: boolean
}

type BanxicoTipoCambioResponse = {
  moneda: string
  tipo_cambio: number
  serie: string
  descripcion?: string | null
  fecha?: string | null
  fuente: string
  fuente_url?: string | null
  actualizado_en: string
}

type OrderExchangeRateStatus = {
  loading: boolean
  message: string
  sourceLabel: string
}

function isBanxicoTipoCambioResponse(
  value: BanxicoTipoCambioResponse | { error?: string } | null,
): value is BanxicoTipoCambioResponse {
  return Boolean(
    value &&
      typeof value === "object" &&
      "tipo_cambio" in value &&
      "serie" in value &&
      "fuente" in value,
  )
}

function calculateOrderLineTotal(line: OrderLine): number {
  const qty = Number.isFinite(line.cantidad_solicitada) ? line.cantidad_solicitada : 0
  const cost = Number.isFinite(line.costo_unitario) ? line.costo_unitario : 0
  const discount = Number.parseFloat(line.descuento_porcentaje || "0")
  const gross = qty * cost
  const discountAmount = Number.isFinite(discount) ? (gross * discount) / 100 : 0
  return Math.max(gross - discountAmount, 0)
}

const ORDER_DOCUMENT_DEFINITIONS: OrderDocumentDefinition[] = [
  {
    tipoDocumento: "commercial_invoice",
    label: "Factura comercial",
    help: "Documento base de la orden.",
    appliesTo: "ambos",
    requiredByDefault: true,
  },
  {
    tipoDocumento: "packing_list",
    label: "Packing list",
    help: "Lista de empaque y bultos.",
    appliesTo: "ambos",
    requiredByDefault: true,
  },
  {
    tipoDocumento: "bill_of_lading",
    label: "Bill of lading",
    help: "Conocimiento de embarque marítimo.",
    appliesTo: "internacional",
    requiredByDefault: true,
  },
  {
    tipoDocumento: "air_waybill",
    label: "Air waybill",
    help: "Guía aérea.",
    appliesTo: "internacional",
    requiredByDefault: true,
  },
  {
    tipoDocumento: "certificate_of_origin",
    label: "Certificado de origen",
    help: "Preferencias arancelarias y origen.",
    appliesTo: "internacional",
    requiredByDefault: true,
  },
  {
    tipoDocumento: "ficha_tecnica",
    label: "Ficha técnica",
    help: "Especificaciones del producto.",
    appliesTo: "ambos",
    requiredByDefault: true,
  },
  {
    tipoDocumento: "msds",
    label: "MSDS / SDS",
    help: "Hoja de seguridad.",
    appliesTo: "internacional",
  },
  {
    tipoDocumento: "certificado_calidad",
    label: "Certificado de calidad",
    help: "Validación de calidad.",
    appliesTo: "ambos",
  },
  {
    tipoDocumento: "certificado_sanitario",
    label: "Certificado sanitario",
    help: "Cumplimiento sanitario.",
    appliesTo: "internacional",
  },
  {
    tipoDocumento: "certificado_nom",
    label: "Certificado NOM",
    help: "Cumplimiento normativo México.",
    appliesTo: "internacional",
  },
  {
    tipoDocumento: "garantia",
    label: "Garantía",
    help: "Términos de garantía / soporte.",
    appliesTo: "ambos",
  },
]

function getOrderDocumentDefinitions(tipoOperacion: "nacional" | "internacional"): OrderDocumentDefinition[] {
  return ORDER_DOCUMENT_DEFINITIONS.filter((definition) => definition.appliesTo === "ambos" || definition.appliesTo === tipoOperacion)
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

function parseCurrencyInput(value: string): number {
  const raw = value.replace(/\s+/g, "").replace(/[^0-9,.-]/g, "")
  if (!raw) {
    return 0
  }
  const lastComma = raw.lastIndexOf(",")
  const lastDot = raw.lastIndexOf(".")
  const decimalSeparator = lastComma > lastDot ? "," : lastDot > -1 ? "." : null
  const normalized = decimalSeparator
    ? (() => {
        const parts = raw.split(decimalSeparator)
        const whole = parts.slice(0, -1).join("").replace(/[.,-]/g, "")
        const fraction = parts[parts.length - 1]?.replace(/[.,-]/g, "") ?? ""
        return `${whole || "0"}.${fraction}`
      })()
    : raw.replace(/[^\d-]/g, "")
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatCurrencyInput(value: unknown, currency = "MXN", editing = false): string {
  const numberValue = asNumber(value)
  if (editing) {
    return numberValue > 0 ? String(numberValue) : ""
  }
  return numberValue > 0 ? formatCurrency(numberValue, currency) : ""
}

function formatDecimalInput(value: number | null, fractionDigits = 2): string {
  if (value === null || !Number.isFinite(value)) {
    return ""
  }
  return value.toFixed(fractionDigits)
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

function formatDateOnly(value: unknown): string {
  if (typeof value !== "string" || !value) return ""
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10)
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, "0")
  const day = String(parsed.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
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

function getPaymentEventOptions(tipoOperacion: "nacional" | "internacional"): Array<{ value: string; label: string }> {
  const shared = [
    { value: "contra_anticipo", label: "Contra anticipo" },
    { value: "contra_aceptacion_orden", label: "Contra aceptación de la orden" },
    { value: "contra_factura", label: "Contra factura" },
    { value: "contra_entrega", label: "Contra entrega" },
    { value: "contra_recepcion", label: "Contra recepción" },
    { value: "gasto_adicional", label: "Gasto adicional" },
  ]
  if (tipoOperacion === "internacional") {
    return [
      ...shared,
      { value: "contra_inicio_produccion", label: "Contra inicio de producción" },
      { value: "contra_embarque", label: "Contra embarque" },
      { value: "contra_bl_awb", label: "Contra BL / AWB" },
      { value: "contra_arribo", label: "Contra arribo" },
      { value: "credito_x_dias", label: "Crédito a X días" },
    ]
  }
  return [
    ...shared,
    { value: "30_dias_factura", label: "30 días factura" },
    { value: "45_dias_factura", label: "45 días factura" },
    { value: "60_dias_factura", label: "60 días factura" },
  ]
}

function getSuggestedSaldoEvent(tipoOperacion: "nacional" | "internacional", incotermCode: string): string {
  const normalized = String(incotermCode || "").trim().toUpperCase()
  if (tipoOperacion === "internacional") {
    if (["DAP", "DPU", "DDP"].includes(normalized)) return "contra_entrega"
    if (["FOB", "CFR", "CIF"].includes(normalized)) return "contra_bl_awb"
    if (["FAS"].includes(normalized)) return "contra_embarque"
    if (["EXW", "FCA"].includes(normalized)) return "contra_anticipo"
    return "contra_bl_awb"
  }
  return "contra_factura"
}

function addDaysToIsoDate(isoDate: string, days: number): string {
  if (!isoDate || !Number.isFinite(days) || days < 0) {
    return ""
  }
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? new Date(`${isoDate}T00:00:00`) : new Date(isoDate)
  if (Number.isNaN(parsed.getTime())) {
    return ""
  }
  const date = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
  date.setDate(date.getDate() + Math.trunc(days))
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function calculatePaymentScheduleAmount(subtotal: number, porcentaje: string): string {
  const parsed = Number.parseFloat(porcentaje)
  if (!Number.isFinite(subtotal) || subtotal <= 0 || !Number.isFinite(parsed)) {
    return ""
  }
  return (subtotal * (parsed / 100)).toFixed(4)
}

function calculatePaymentScheduleDueDate(fechaEventoReal: string, diasCredito: string): string {
  const days = Number.parseFloat(diasCredito)
  if (!fechaEventoReal || !Number.isFinite(days) || days < 0) {
    return ""
  }
  return addDaysToIsoDate(fechaEventoReal, days)
}

function buildOrderPaymentScheduleExtrasFromOrder(order: AnyRecord | undefined | null): OrderPaymentScheduleLine[] {
  const currency = asString(order?.moneda, "MXN")
  const subtotal = asNumber(order?.subtotal)
  const pagos = Array.isArray((order as AnyRecord | null)?.pagos_programados)
    ? ((order as AnyRecord).pagos_programados as AnyRecord[])
    : []

  if (pagos.length > 0) {
    return pagos
      .filter((row) => Boolean(row) && typeof row === "object")
      .filter((row) => {
        const tipoPago = asString(row.tipo_pago, "").toLowerCase()
        return !["anticipo", "saldo"].includes(tipoPago)
      })
      .map((row) => {
        const porcentaje = asString(row.porcentaje, "")
        const monto = asString(row.monto, "") || calculatePaymentScheduleAmount(subtotal, porcentaje)
        return {
          tipo_pago: (asString(row.tipo_pago, "anticipo") as OrderPaymentScheduleLine["tipo_pago"]) || "anticipo",
          evento_base: asString(row.evento_base, ""),
          porcentaje,
          monto,
          moneda_codigo: asString(row.moneda_codigo, currency),
          dias_credito: asString(row.dias_credito, ""),
          fecha_vencimiento_calculada: asString(row.fecha_vencimiento_calculada, ""),
          fecha_evento_real: asString(row.fecha_evento_real, ""),
          fecha_pago_real: asString(row.fecha_pago_real, ""),
          referencia_pago: asString(row.referencia_pago, ""),
          estado: (asString(row.estado, "programado") as OrderPaymentScheduleLine["estado"]) || "programado",
          observaciones: asString(row.observaciones, ""),
        }
      })
  }
  return []
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

function createEmptyOrderPaymentSchedule(tipoPago: OrderPaymentScheduleLine["tipo_pago"], currency = "MXN", tipoOperacion: "nacional" | "internacional" = "nacional"): OrderPaymentScheduleLine {
  return {
    tipo_pago: tipoPago,
    evento_base:
      tipoPago === "anticipo"
        ? "contra_aceptacion_orden"
        : tipoOperacion === "internacional"
          ? "contra_bl_awb"
          : "contra_factura",
    porcentaje: "",
    monto: "",
    moneda_codigo: currency,
    dias_credito: "",
    fecha_vencimiento_calculada: "",
    fecha_evento_real: "",
    fecha_pago_real: "",
    referencia_pago: "",
    estado: "programado",
    observaciones: "",
  }
}

function buildDerivedPaymentSchedules(
  subtotal: number,
  currency: string,
  tipoOperacion: "nacional" | "internacional",
  paymentSummary: AnyRecord,
  orderEmissionIso: string,
): OrderPaymentScheduleLine[] {
  const defaultSaldoEvent = tipoOperacion === "internacional" ? "contra_bl_awb" : "contra_factura"
  const anticipoPct = asString(paymentSummary.porcentaje_anticipo, "")
  const saldoPct = asString(paymentSummary.porcentaje_saldo, "")
  const saldoDias = asString(paymentSummary.dias_credito, "")
  const saldoEventoReal = asString(paymentSummary.fecha_evento_saldo_real, "")
  const saldoReferencia = asString(paymentSummary.referencia_pago_saldo, "")
  const saldoVencimiento = calculatePaymentScheduleDueDate(saldoEventoReal, saldoDias)

  return [
    {
      tipo_pago: "anticipo",
      evento_base: "contra_anticipo",
      porcentaje: anticipoPct,
      monto: calculatePaymentScheduleAmount(subtotal, anticipoPct),
      moneda_codigo: currency,
      dias_credito: "",
      fecha_vencimiento_calculada: "",
      fecha_evento_real: formatDateOnly(orderEmissionIso),
      fecha_pago_real: "",
      referencia_pago: "",
      estado: "programado",
      observaciones: "",
    },
    {
      tipo_pago: "saldo",
      evento_base: asString(paymentSummary.momento_pago_saldo, defaultSaldoEvent) || defaultSaldoEvent,
      porcentaje: saldoPct,
      monto: calculatePaymentScheduleAmount(subtotal, saldoPct),
      moneda_codigo: currency,
      dias_credito: saldoDias,
      fecha_vencimiento_calculada: saldoVencimiento,
      fecha_evento_real: saldoEventoReal,
      fecha_pago_real: "",
      referencia_pago: saldoReferencia,
      estado: "programado",
      observaciones: "",
    },
  ]
}

function resolveOrderAnticipoLimit(order: AnyRecord | undefined | null): number {
  if (!order || typeof order !== "object") {
    return 0
  }
  const payment = (order.condiciones_pago as AnyRecord | undefined) ?? {}
  const montoAnticipo = asNumber(payment.monto_anticipo)
  if (montoAnticipo > 0) {
    return montoAnticipo
  }
  const porcentajeAnticipo = asNumber(payment.porcentaje_anticipo)
  const subtotal = asNumber(order.subtotal)
  if (subtotal <= 0 || porcentajeAnticipo <= 0) {
    return 0
  }
  return (subtotal * porcentajeAnticipo) / 100
}

function resolveOrderSaldoLimit(order: AnyRecord | undefined | null): number {
  if (!order || typeof order !== "object") {
    return 0
  }
  const payment = (order.condiciones_pago as AnyRecord | undefined) ?? {}
  const montoSaldo = asNumber(payment.monto_saldo)
  if (montoSaldo > 0) {
    return montoSaldo
  }
  const porcentajeSaldo = asNumber(payment.porcentaje_saldo)
  const subtotal = asNumber(order.subtotal)
  if (subtotal <= 0 || porcentajeSaldo <= 0) {
    return 0
  }
  return (subtotal * porcentajeSaldo) / 100
}

function sumOrderAnticipoPayments(rows: AnyRecord[]): number {
  return rows.reduce((sum, row) => {
    if (!row || typeof row !== "object") {
      return sum
    }
    if (String((row as AnyRecord).tipo_pago || "").toLowerCase() !== "anticipo") {
      return sum
    }
    if (String((row as AnyRecord).estado || "").toLowerCase() === "cancelado") {
      return sum
    }
    return sum + asNumber((row as AnyRecord).monto)
  }, 0)
}

function sumOrderSaldoPayments(rows: AnyRecord[]): number {
  return rows.reduce((sum, row) => {
    if (!row || typeof row !== "object") {
      return sum
    }
    if (String((row as AnyRecord).tipo_pago || "").toLowerCase() !== "saldo") {
      return sum
    }
    if (String((row as AnyRecord).estado || "").toLowerCase() === "cancelado") {
      return sum
    }
    return sum + asNumber((row as AnyRecord).monto)
  }, 0)
}

function mergePaymentScheduleForDisplay(
  base: OrderPaymentScheduleLine,
  stored?: AnyRecord | null,
): OrderPaymentScheduleLine {
  if (!stored || typeof stored !== "object") {
    return base
  }
  return {
    ...base,
    evento_base: asString(stored.evento_base, base.evento_base),
    porcentaje: asString(stored.porcentaje, base.porcentaje),
    monto: asString(stored.monto, base.monto),
    moneda_codigo: asString(stored.moneda_codigo, base.moneda_codigo),
    dias_credito: asString(stored.dias_credito, base.dias_credito),
    fecha_vencimiento_calculada: asString(stored.fecha_vencimiento_calculada, base.fecha_vencimiento_calculada),
    fecha_evento_real: asString(stored.fecha_evento_real, base.fecha_evento_real),
    fecha_pago_real: asString(stored.fecha_pago_real, base.fecha_pago_real),
    referencia_pago: asString(stored.referencia_pago, base.referencia_pago),
    estado: (asString(stored.estado, base.estado) as OrderPaymentScheduleLine["estado"]) || base.estado,
    observaciones: asString(stored.observaciones, base.observaciones),
  }
}

function getPaymentDisplayDueLabel(row: AnyRecord): string {
  if (asString(row.estado, "") === "pagado") {
    return "Pagado"
  }
  const due = asString(row.fecha_vencimiento_calculada, "")
  if (due) {
    return due
  }
  const paymentDate = asString(row.fecha_pago_real, "")
  if (paymentDate) {
    return paymentDate
  }
  return "Pendiente"
}

function getPaymentTypeLabel(tipoPago: unknown): string {
  const normalized = String(tipoPago ?? "").toLowerCase()
  if (normalized === "anticipo") return "Anticipo"
  if (normalized === "saldo") return "Saldo"
  if (normalized === "parcial") return "Gasto"
  return asString(tipoPago, "Pago")
}

function getPaymentDisplayDate(row: AnyRecord, fallback: string): string {
  const paymentDate = asString(row.fecha_pago_real, "")
  if (paymentDate) {
    return paymentDate
  }
  const eventDate = asString(row.fecha_evento_real, "")
  if (eventDate) {
    return eventDate
  }
  return fallback
}

function getPaymentNormalizationDate(row: AnyRecord, fallback: string): string {
  const candidates = [
    asString(row.fecha_pago_real, ""),
    asString(row.fecha_evento_real, ""),
    asString(row.creado_en, ""),
    asString(row.actualizado_en, ""),
    fallback,
  ]
  for (const candidate of candidates) {
    const normalized = formatDateOnly(candidate)
    if (normalized) {
      return normalized
    }
  }
  return ""
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
  agentesAduanales,
  pedimentosImportacion,
  selectedPedimento,
  selectedPedimentoId,
  defaultOrderId,
  defaultWarehouseId,
  defaultWarehouseCode,
  defaultProviderCode,
  defaultReceptionNumber,
  defaultOrderFolio,
  defaultOrderEmissionIso,
  defaultPaymentOrderId,
  activeView,
}: ComprasWorkspaceProps) {
  const router = useRouter()
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
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false)
  const [isOrderPaymentsModalOpen, setIsOrderPaymentsModalOpen] = useState(false)
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
  const [orderExchangeRateStatus, setOrderExchangeRateStatus] = useState<OrderExchangeRateStatus>({
    loading: false,
    message: "Se actualiza automáticamente desde Banxico según la moneda seleccionada.",
    sourceLabel: "",
  })
  const [orderVigenciaHasta, setOrderVigenciaHasta] = useState("")
  const [orderProformaReferencia, setOrderProformaReferencia] = useState("")
  const [orderProformaFile, setOrderProformaFile] = useState<File | null>(null)
  const [orderProformaFileName, setOrderProformaFileName] = useState("")
  const [orderProformaInputKey, setOrderProformaInputKey] = useState(0)
  const [orderReferenceExternal, setOrderReferenceExternal] = useState("")
  const [orderObservations, setOrderObservations] = useState("")
  const [orderInstructions, setOrderInstructions] = useState("")
  const [orderLines, setOrderLines] = useState<OrderLine[]>(() => [createEmptyOrderLine()])
  const [editingOrderLineCostIndex, setEditingOrderLineCostIndex] = useState<number | null>(null)
  const [editingOrderLineCostDraft, setEditingOrderLineCostDraft] = useState("")
  const [editingReceptionLineCostIndex, setEditingReceptionLineCostIndex] = useState<number | null>(null)
  const [editingReceptionLineCostDraft, setEditingReceptionLineCostDraft] = useState("")
  const [editingOrderMontoAsegurado, setEditingOrderMontoAsegurado] = useState(false)
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
  const [, setOrderCondicionesComercialesObservaciones] = useState("")
  const [orderFormaPago, setOrderFormaPago] = useState("")
  const [orderPorcentajeAnticipo, setOrderPorcentajeAnticipo] = useState("")
  const [orderMomentoPagoSaldo, setOrderMomentoPagoSaldo] = useState("")
  const [orderDiasCredito, setOrderDiasCredito] = useState("")
  const [orderDatosBancariosProveedor, setOrderDatosBancariosProveedor] = useState("")
  const [orderCondicionesPagoObservaciones, setOrderCondicionesPagoObservaciones] = useState("")
  const [orderPaymentSchedules, setOrderPaymentSchedules] = useState<OrderPaymentScheduleLine[]>([])
  const [editingPaymentScheduleAmountIndex, setEditingPaymentScheduleAmountIndex] = useState<number | null>(null)
  const [paymentMxnLookupByKey, setPaymentMxnLookupByKey] = useState<Record<string, PaymentMxnLookupState>>({})
  const [editingPaymentScheduleRecord, setEditingPaymentScheduleRecord] = useState<PaymentScheduleRecordDraft | null>(null)
  const [editingRegisteredPaymentAmountFocused, setEditingRegisteredPaymentAmountFocused] = useState(false)
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
  const orderHydratingRef = useRef(false)
  const orderExchangeRateRequestIdRef = useRef(0)
  const paymentMxnLookupRequestIdRef = useRef(0)
  const createEmptyDocumentUploadSlot = useCallback(
    () => ({ id: crypto.randomUUID(), file: null as File | null, fileName: "" }),
    [],
  )
  const [orderDocumentUploadSlots, setOrderDocumentUploadSlots] = useState<
    Record<string, Array<{ id: string; file: File | null; fileName: string }>>
  >({})

  const selectedOrderRecord = useMemo(
    () => ordenes.find((orden) => String(orden.id) === selectedOrderId) ?? null,
    [ordenes, selectedOrderId],
  )
  const selectedOrderCurrency = asString(selectedOrderRecord?.moneda, "MXN")
  const selectedOrderStatus = String(selectedOrderRecord?.estado ?? "").toLowerCase()
  const selectedProvider = selectedOrderRecord && typeof selectedOrderRecord.proveedor === "object" ? (selectedOrderRecord.proveedor as AnyRecord) : null
  const selectedOrderDocuments = useMemo(
    () =>
      Array.isArray((selectedOrderRecord as AnyRecord | null)?.documentos)
        ? ((selectedOrderRecord as AnyRecord).documentos as AnyRecord[])
        : [],
    [selectedOrderRecord],
  )
  const normalizeOrderDocumentBaseType = useCallback((value: unknown) => {
    const raw = asString(value, "").trim().toLowerCase()
    if (!raw) {
      return ""
    }
    return raw.split("__")[0] ?? ""
  }, [])
  const selectedOrderDocumentsByType = useMemo(() => {
    const map = new Map<string, AnyRecord[]>()
    for (const documento of selectedOrderDocuments) {
      const tipoDocumento = normalizeOrderDocumentBaseType(documento?.tipo_documento)
      if (tipoDocumento) {
        const current = map.get(tipoDocumento) ?? []
        current.push(documento)
        map.set(tipoDocumento, current)
      }
    }
    return map
  }, [normalizeOrderDocumentBaseType, selectedOrderDocuments])
  const selectedOrderHasProforma = selectedOrderDocuments.some(
    (documento) => String(documento?.tipo_documento || "").toLowerCase() === "proforma",
  )
  const selectedOrderProformaHref = selectedOrderHasProforma && selectedOrderRecord ? `/api/compras/ordenes/${selectedOrderRecord.id}/proforma` : null
  const selectedOrderPaymentSchedules = useMemo(
    () =>
      Array.isArray((selectedOrderRecord as AnyRecord | null)?.pagos_programados)
        ? ((selectedOrderRecord as AnyRecord).pagos_programados as AnyRecord[])
        : [],
    [selectedOrderRecord],
  )
  const selectedOrderAnticipoLimit = useMemo(
    () => resolveOrderAnticipoLimit(selectedOrderRecord),
    [selectedOrderRecord],
  )
  const selectedOrderAnticipoPaid = useMemo(
    () => sumOrderAnticipoPayments(selectedOrderPaymentSchedules),
    [selectedOrderPaymentSchedules],
  )
  const selectedOrderAnticipoRemaining = Math.max(selectedOrderAnticipoLimit - selectedOrderAnticipoPaid, 0)
  const canCreateAnticipoPayment = selectedOrderAnticipoRemaining > 0
  const selectedOrderSaldoLimit = useMemo(
    () => resolveOrderSaldoLimit(selectedOrderRecord),
    [selectedOrderRecord],
  )
  const selectedOrderSaldoPaid = useMemo(
    () => sumOrderSaldoPayments(selectedOrderPaymentSchedules),
    [selectedOrderPaymentSchedules],
  )
  const selectedOrderSaldoRemaining = Math.max(selectedOrderSaldoLimit - selectedOrderSaldoPaid, 0)
  const canCreateSaldoPayment = selectedOrderSaldoRemaining > 0
  const selectedOrderPaymentScheduleByType = useMemo(() => {
    const map = new Map<string, AnyRecord>()
    for (const pago of selectedOrderPaymentSchedules) {
      const tipoPago = asString(pago?.tipo_pago, "").toLowerCase()
      if (tipoPago && !map.has(tipoPago)) {
        map.set(tipoPago, pago)
      }
    }
    return map
  }, [selectedOrderPaymentSchedules])
  const selectedOrderHasSaldoPayment = useMemo(
    () => selectedOrderPaymentSchedules.some((pago) => asString(pago?.tipo_pago, "") === "saldo"),
    [selectedOrderPaymentSchedules],
  )
  const selectedOrderHasAnticipoPayment = useMemo(
    () =>
      selectedOrderPaymentSchedules.some(
        (pago) => asString(pago?.tipo_pago, "") === "anticipo" && asString(pago?.estado, "") === "pagado",
      ),
    [selectedOrderPaymentSchedules],
  )
  const selectedOrderHasSaldoCompliancePaid = useMemo(
    () =>
      selectedOrderPaymentSchedules.some(
        (pago) => asString(pago?.tipo_pago, "") === "saldo" && asString(pago?.estado, "") === "pagado",
      ),
    [selectedOrderPaymentSchedules],
  )
  const selectedOrderCompliancePaymentsSettled = selectedOrderHasAnticipoPayment && selectedOrderHasSaldoCompliancePaid
  const orderPedimentoByOrderId = useMemo(() => {
    const map = new Map<string, { pedimento_id: string; numero_pedimento: string; estado: string }>()
    for (const pedimento of pedimentosImportacion) {
      const linkedOrders = Array.isArray((pedimento as AnyRecord).ordenes_compra)
        ? ((pedimento as AnyRecord).ordenes_compra as AnyRecord[])
        : []
      for (const rel of linkedOrders) {
        const ordenId = asString(rel.orden_compra_id)
        if (!ordenId || map.has(ordenId)) {
          continue
        }
        map.set(ordenId, {
          pedimento_id: asString(pedimento.id),
          numero_pedimento: asString(pedimento.numero_pedimento, "Sin número"),
          estado: asString(pedimento.estado),
        })
      }
    }
    return map
  }, [pedimentosImportacion])
  const selectedOrderPedimento = selectedOrderRecord ? orderPedimentoByOrderId.get(String(selectedOrderRecord.id)) ?? null : null
  const selectedOrderPaymentsTotalMxn = useMemo(() => {
    return selectedOrderPaymentSchedules.reduce((sum, row, index) => {
      const lookupKey = String(row.id ?? `${row.tipo_pago}-${index}`)
      const normalized = paymentMxnLookupByKey[lookupKey]
      const amountMxn = normalized ? asNumber(normalized.montoMxn) : 0
      return sum + amountMxn
    }, 0)
  }, [paymentMxnLookupByKey, selectedOrderPaymentSchedules])
  const firstRegisteredSaldoIndex = useMemo(
    () => selectedOrderPaymentSchedules.findIndex((pago) => asString(pago?.tipo_pago, "") === "saldo"),
    [selectedOrderPaymentSchedules],
  )
  const firstEditableSaldoIndex = useMemo(
    () => orderPaymentSchedules.findIndex((row) => row.tipo_pago === "saldo"),
    [orderPaymentSchedules],
  )
  const getOrderDocumentsSummary = (orden: AnyRecord): { total: number; proforma: number; anexos: number } => {
    const documentos = Array.isArray(orden.documentos)
      ? orden.documentos.filter((documento) => Boolean(documento) && typeof documento === "object")
      : []
    const proforma = documentos.filter((documento) => String((documento as AnyRecord).tipo_documento || "").toLowerCase() === "proforma").length
    return {
      total: documentos.length,
      proforma,
      anexos: Math.max(documentos.length - proforma, 0),
    }
  }
  const getOrderPaymentsSummary = (
    orden: AnyRecord,
  ): { total: number; anticipo: number; saldo: number; parciales: number; pagados: number } => {
    const pagos = Array.isArray(orden.pagos_programados) ? orden.pagos_programados.filter((pago) => Boolean(pago) && typeof pago === "object") : []
    const anticipo = pagos.filter((pago) => String((pago as AnyRecord).tipo_pago || "").toLowerCase() === "anticipo").length
    const saldo = pagos.filter((pago) => String((pago as AnyRecord).tipo_pago || "").toLowerCase() === "saldo").length
    const parciales = pagos.filter((pago) => String((pago as AnyRecord).tipo_pago || "").toLowerCase() === "parcial").length
    const pagados = pagos.filter((pago) => String((pago as AnyRecord).estado || "").toLowerCase() === "pagado").length
    return {
      total: pagos.length,
      anticipo,
      saldo,
      parciales,
      pagados,
    }
  }
  const openOrderPayments = (orden: AnyRecord) => {
    const orderId = String(orden.id)
    setSelectedOrderId(orderId)
    setOrderPaymentSchedules(buildOrderPaymentScheduleExtrasFromOrder(orden))
    setEditingPaymentScheduleRecord(null)
    setEditingPaymentScheduleAmountIndex(null)
    setEditingRegisteredPaymentAmountFocused(false)
    setIsOrderPaymentsModalOpen(true)
  }

  const openCreateOrderModal = () => {
    clearOrderForm()
    resetOrderDocumentUploadSlots()
    setIsOrderModalOpen(true)
  }

  const openEditOrderModal = (orden: AnyRecord) => {
    setSelectedOrderId(String(orden.id))
    startEditOrder(orden)
    resetOrderDocumentUploadSlots()
    setIsOrderModalOpen(true)
  }

  const handleOrderModalOpenChange = (open: boolean) => {
    setIsOrderModalOpen(open)
    if (!open) {
      clearOrderForm()
    }
  }

  const handleOrderPaymentsModalOpenChange = (open: boolean) => {
    setIsOrderPaymentsModalOpen(open)
    if (!open) {
      setEditingPaymentScheduleRecord(null)
      setEditingPaymentScheduleAmountIndex(null)
      setEditingRegisteredPaymentAmountFocused(false)
      if (defaultPaymentOrderId) {
        router.replace("/compras?vista=ordenes")
      }
    }
  }

  const totalReceived = lines.reduce((sum, line) => sum + (Number.isFinite(line.cantidad_recibida) ? line.cantidad_recibida : 0), 0)
  const totalValue = lines.reduce((sum, line) => sum + (Number.isFinite(line.cantidad_recibida) ? line.cantidad_recibida : 0) * (Number.isFinite(line.costo_unitario_real) ? line.costo_unitario_real : 0), 0)
  const orderSubtotal = orderLines.reduce((sum, line) => sum + calculateOrderLineTotal(line), 0)
  const orderPorcentajeAnticipoValue = Number.parseFloat(orderPorcentajeAnticipo)
  const orderMontoAnticipoCalculated =
    Number.isFinite(orderPorcentajeAnticipoValue) && orderPorcentajeAnticipoValue >= 0
      ? orderSubtotal * (orderPorcentajeAnticipoValue / 100)
      : null
  const orderPorcentajeSaldoCalculated =
    Number.isFinite(orderPorcentajeAnticipoValue) && orderPorcentajeAnticipoValue >= 0
      ? Math.max(100 - orderPorcentajeAnticipoValue, 0)
      : null
  const orderMontoSaldoCalculated =
    orderMontoAnticipoCalculated !== null
      ? Math.max(orderSubtotal - orderMontoAnticipoCalculated, 0)
      : null
  const orderMontoAnticipoDisplay = orderMontoAnticipoCalculated ?? 0
  const orderMontoSaldoDisplay = orderMontoSaldoCalculated ?? 0
  const orderMomentoPagoSaldoSuggested = useMemo(
    () => getSuggestedSaldoEvent(orderType, orderIncotermCodigo),
    [orderType, orderIncotermCodigo],
  )
  const orderExchangeRateValue = Number.parseFloat(orderExchangeRate)
  const orderSubtotalMxn = Number.isFinite(orderExchangeRateValue) && orderExchangeRateValue > 0
    ? orderSubtotal * orderExchangeRateValue
    : null
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
  const orderDocumentDefinitions = useMemo(() => getOrderDocumentDefinitions(orderType), [orderType])
  const resetOrderDocumentUploadSlots = useCallback(() => {
    const nextSlots = Object.fromEntries(
      orderDocumentDefinitions.map((definition) => [definition.tipoDocumento, [createEmptyDocumentUploadSlot()]]),
    )
    setOrderDocumentUploadSlots(nextSlots)
  }, [createEmptyDocumentUploadSlot, orderDocumentDefinitions])

  useEffect(() => {
    if (!isOrderModalOpen) {
      return
    }
    setOrderDocumentUploadSlots((current) => {
      const next: Record<string, Array<{ id: string; file: File | null; fileName: string }>> = {}
      let changed = false
      for (const definition of orderDocumentDefinitions) {
        const existing = current[definition.tipoDocumento]
        if (Array.isArray(existing) && existing.length > 0) {
          next[definition.tipoDocumento] = existing
        } else {
          next[definition.tipoDocumento] = [createEmptyDocumentUploadSlot()]
          changed = true
        }
      }
      const currentKeys = Object.keys(current)
      if (currentKeys.some((key) => !orderDocumentDefinitions.some((definition) => definition.tipoDocumento === key))) {
        changed = true
      }
      return changed ? next : current
    })
  }, [createEmptyDocumentUploadSlot, isOrderModalOpen, orderDocumentDefinitions])
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
  const paymentEventOptions = useMemo(() => getPaymentEventOptions(orderType), [orderType])
  const derivedPaymentSchedules = useMemo(
    () => {
      const derived = buildDerivedPaymentSchedules(
        orderSubtotal,
        orderCurrency,
        orderType,
        {
          porcentaje_anticipo: orderPorcentajeAnticipo,
          porcentaje_saldo: orderPorcentajeSaldoCalculated?.toFixed(2) ?? "",
          dias_credito: orderDiasCredito,
          momento_pago_saldo: orderMomentoPagoSaldo,
          referencia_pago_saldo: asString(selectedOrderPaymentScheduleByType.get("saldo")?.referencia_pago, ""),
          fecha_evento_saldo_real: asString(selectedOrderPaymentScheduleByType.get("saldo")?.fecha_evento_real, ""),
        },
        orderEmissionIso,
      )
      return derived.map((row) => mergePaymentScheduleForDisplay(row, selectedOrderPaymentScheduleByType.get(row.tipo_pago)))
    },
    [
      orderSubtotal,
      orderCurrency,
      orderType,
      orderPorcentajeAnticipo,
      orderPorcentajeSaldoCalculated,
      orderDiasCredito,
      orderMomentoPagoSaldo,
      orderEmissionIso,
      selectedOrderPaymentScheduleByType,
    ],
  )
  const refreshOrderExchangeRate = useCallback(async (currencyCode: string) => {
    const normalizedCurrency = String(currencyCode || "").trim().toUpperCase()
    const requestId = ++orderExchangeRateRequestIdRef.current

    if (!normalizedCurrency) {
      if (requestId === orderExchangeRateRequestIdRef.current) {
        setOrderExchangeRate("")
        setOrderExchangeRateStatus({
          loading: false,
          message: "Selecciona una moneda para calcular el tipo de cambio.",
          sourceLabel: "",
        })
      }
      return
    }

    if (normalizedCurrency === "MXN") {
      if (requestId === orderExchangeRateRequestIdRef.current) {
        setOrderExchangeRate("1")
        setOrderExchangeRateStatus({
          loading: false,
          message: "Moneda nacional: 1 MXN = 1 MXN.",
          sourceLabel: "Banxico / MXN",
        })
      }
      return
    }

    setOrderExchangeRateStatus({
      loading: true,
      message: `Consultando tipo de cambio Banxico para ${normalizedCurrency}...`,
      sourceLabel: "",
    })

    try {
      const response = await fetch(`/api/compras/tipo-cambio?moneda=${encodeURIComponent(normalizedCurrency)}`, {
        cache: "no-store",
      })
      const data = (await response.json().catch(() => null)) as BanxicoTipoCambioResponse | { error?: string } | null
      const payload = isBanxicoTipoCambioResponse(data) ? data : null
      if (!response.ok) {
        const errorCode = typeof data === "object" && data && "error" in data ? String(data.error ?? "") : ""
        throw new Error(errorCode || "tipo_cambio_no_disponible")
      }
      if (!payload) {
        throw new Error("tipo_cambio_no_disponible")
      }
      const rate = Number(payload.tipo_cambio)
      if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error("tipo_cambio_invalido")
      }
      if (requestId !== orderExchangeRateRequestIdRef.current) {
        return
      }
      setOrderExchangeRate(rate.toFixed(6).replace(/\.?0+$/, ""))
      const fecha = asString(payload.fecha, "")
      const fuente = asString(payload.fuente, "Banxico")
      const serie = asString(payload.serie, "")
      setOrderExchangeRateStatus({
        loading: false,
        message: fecha ? `Actualizado desde ${fuente} ${serie} · ${fecha}` : `Actualizado desde ${fuente} ${serie}`,
        sourceLabel: serie ? `${fuente} · ${serie}` : fuente,
      })
    } catch (error) {
      if (requestId !== orderExchangeRateRequestIdRef.current) {
        return
      }
      const message = error instanceof Error ? error.message : "tipo_cambio_no_disponible"
      setOrderExchangeRate("")
      let userMessage = "No se pudo consultar Banxico. Captura el tipo de cambio manualmente."
      if (message === "moneda_no_soportada_en_banxico") {
        userMessage = "Banxico no publica automáticamente esta moneda. Captura el tipo de cambio manualmente."
      } else if (message === "banxico_token_missing") {
        userMessage = "Falta configurar BANXICO_TOKEN en el backend."
      }
      setOrderExchangeRateStatus({
        loading: false,
        message: userMessage,
        sourceLabel: "",
      })
    }
  }, [])

  useEffect(() => {
    if (orderHydratingRef.current) {
      return
    }
    void refreshOrderExchangeRate(orderCurrency)
  }, [orderCurrency, refreshOrderExchangeRate])

  useEffect(() => {
    if (!orderMomentoPagoSaldoSuggested) {
      return
    }
    setOrderMomentoPagoSaldo((current) => {
      const trimmed = current.trim()
      if (!trimmed) {
        return orderMomentoPagoSaldoSuggested
      }
      return current
    })
  }, [orderMomentoPagoSaldoSuggested])

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

  const updateOrderPaymentSchedule = (index: number, patch: Partial<OrderPaymentScheduleLine>) => {
    setOrderPaymentSchedules((current) =>
      current.map((row, currentIndex) => (currentIndex === index ? { ...row, ...patch } : row)),
    )
  }

  const addOrderPaymentSchedule = () => {
    setOrderPaymentSchedules((current) => [
      ...current,
      createEmptyOrderPaymentSchedule("parcial", orderCurrency, orderType),
    ])
  }

  const removeOrderPaymentSchedule = (index: number) => {
    setOrderPaymentSchedules((current) => current.filter((_, currentIndex) => currentIndex !== index))
  }

  const startEditRegisteredPayment = (row: AnyRecord) => {
    const paymentId = asString(row.id, "")
    if (!paymentId) {
      return
    }
    setEditingPaymentScheduleRecord({
      id: paymentId,
      tipo_pago: (asString(row.tipo_pago, "parcial") as OrderPaymentScheduleLine["tipo_pago"]) || "parcial",
      evento_base: asString(row.evento_base, ""),
      porcentaje: asString(row.porcentaje, ""),
      monto: asString(row.monto, ""),
      moneda_codigo: asString(row.moneda_codigo, orderCurrency),
      dias_credito: asString(row.dias_credito, ""),
      fecha_vencimiento_calculada: asString(row.fecha_vencimiento_calculada, ""),
      fecha_evento_real: asString(row.fecha_evento_real, ""),
      fecha_pago_real: asString(row.fecha_pago_real, ""),
      referencia_pago: asString(row.referencia_pago, ""),
      estado: (asString(row.estado, "programado") as OrderPaymentScheduleLine["estado"]) || "programado",
      observaciones: asString(row.observaciones, ""),
    })
    setEditingRegisteredPaymentAmountFocused(false)
  }

  const updateEditingRegisteredPayment = (patch: Partial<PaymentScheduleRecordDraft>) => {
    setEditingPaymentScheduleRecord((current) => (current ? { ...current, ...patch } : current))
  }

  const cancelEditRegisteredPayment = () => {
    setEditingPaymentScheduleRecord(null)
    setEditingRegisteredPaymentAmountFocused(false)
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
  const uploadOrderAttachment = async (orderId: string, tipoDocumento: string, file: File) => {
    const payload = new FormData()
    payload.append("file", file, file.name || "documento.pdf")
    const endpoint =
      tipoDocumento === "proforma"
        ? `/api/compras/ordenes/${encodeURIComponent(orderId)}/proforma`
        : `/api/compras/ordenes/${encodeURIComponent(orderId)}/documentos/${encodeURIComponent(tipoDocumento)}`
    const response = await fetch(endpoint, {
      method: "POST",
      body: payload,
      cache: "no-store",
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error((body as { error?: string })?.error ?? `upload_failed:${tipoDocumento}`)
    }
  }
  const handleOrderFormAction = async (formData: FormData) => {
    const savedOrderId = editingOrderId
      ? await updateOrdenCompraAction(editingOrderId, formData)
      : await createOrdenCompraAction(formData)
    if (savedOrderId) {
      if (orderProformaFile instanceof File && orderProformaFile.size > 0) {
        await uploadOrderAttachment(savedOrderId, "proforma", orderProformaFile)
      }
      for (const [tipoDocumento, slots] of Object.entries(orderDocumentUploadSlots)) {
        for (const slot of slots) {
          if (!(slot.file instanceof File) || slot.file.size <= 0) {
            continue
          }
          await uploadOrderAttachment(savedOrderId, `${tipoDocumento}__${slot.id}`, slot.file)
        }
      }
    }
    router.refresh()
    setOrderProformaFile(null)
    setOrderProformaFileName("")
    setOrderProformaInputKey((current) => current + 1)
    resetOrderDocumentUploadSlots()
  }

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

  const startEditOrder = useCallback((orden: AnyRecord) => {
    orderHydratingRef.current = true
    setEditingOrderLineCostIndex(null)
    setEditingReceptionLineCostIndex(null)
    setEditingOrderId(String(orden.id))
    setOrderProformaInputKey((current) => current + 1)
    setOrderFolio(asString(orden.folio, defaultOrderFolio))
    setOrderProviderId(asString(orden.proveedor_id, ""))
    setOrderWarehouseId(asString(orden.almacen_destino_id, defaultWarehouseId))
    setOrderEmissionIso(formatDateOnly(asString(orden.fecha_emision, defaultOrderEmissionIso)))
    setOrderDueDate(asString(orden.fecha_entrega_estimada, ""))
    setOrderFechaEstimadaArribo(asString(orden.fecha_entrega_estimada, ""))
    setOrderType((asString(orden.tipo_operacion, "nacional") as "nacional" | "internacional") || "nacional")
    setOrderCurrency(asString(orden.moneda, "MXN"))
    setOrderExchangeRate(asString(orden.tipo_cambio_referencia, ""))
    setOrderExchangeRateStatus({
      loading: false,
      message: "Tipo de cambio cargado desde la orden. Si cambias la moneda, se recalcula desde Banxico.",
      sourceLabel: "",
    })
    setOrderVigenciaHasta(asString(orden.vigencia_hasta, ""))
    setOrderProformaReferencia(asString(orden.proforma_referencia, ""))
    setOrderProformaFile(null)
    setOrderProformaFileName("")
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
    setOrderCondicionesComercialesObservaciones(asString(comercial.observaciones, ""))
    setOrderFormaPago(asString(pago.forma_pago, ""))
    setOrderPorcentajeAnticipo(asString(pago.porcentaje_anticipo, ""))
    setOrderMomentoPagoSaldo(asString(pago.momento_pago_saldo, ""))
    setOrderDiasCredito(asString(pago.dias_credito, ""))
    setOrderDatosBancariosProveedor(
      asString((pago.datos_bancarios_proveedor ?? pago.comisiones_bancarias) as unknown, ""),
    )
    setOrderCondicionesPagoObservaciones(asString(pago.observaciones, ""))
    setOrderPaymentSchedules(buildOrderPaymentScheduleExtrasFromOrder(orden))
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
    setEditingOrderMontoAsegurado(false)
    setOrderLogisticaObservaciones(asString(logistica.observaciones, ""))
    setOrderLines(buildOrderLinesFromOrder(orden))
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        orderHydratingRef.current = false
      }, 0)
    } else {
      orderHydratingRef.current = false
    }
  }, [defaultOrderEmissionIso, defaultOrderFolio, defaultWarehouseId])

  useEffect(() => {
    if (activeView !== "ordenes") {
      return
    }
    const targetOrderId = defaultPaymentOrderId || selectedOrderId || defaultOrderId
    if (!targetOrderId) {
      return
    }
    const targetOrder = ordenes.find((orden) => String(orden.id) === targetOrderId) ?? null
    if (!targetOrder) {
      return
    }
    if (String(targetOrder.id) !== selectedOrderId) {
      setSelectedOrderId(String(targetOrder.id))
    }
    if (defaultPaymentOrderId) {
      setOrderPaymentSchedules(buildOrderPaymentScheduleExtrasFromOrder(targetOrder))
      setEditingPaymentScheduleRecord(null)
      setEditingPaymentScheduleAmountIndex(null)
      setEditingRegisteredPaymentAmountFocused(false)
      setIsOrderPaymentsModalOpen(true)
    }
  }, [activeView, defaultPaymentOrderId, defaultOrderId, ordenes, selectedOrderId])

  const clearOrderForm = () => {
    orderHydratingRef.current = true
    setEditingOrderLineCostIndex(null)
    setEditingReceptionLineCostIndex(null)
    setEditingOrderId(null)
    setOrderFolio(defaultOrderFolio)
    setOrderProviderId(String(proveedores[0]?.id ?? ""))
    setOrderWarehouseId(defaultWarehouseId)
    setOrderEmissionIso(formatDateOnly(defaultOrderEmissionIso))
    setOrderDueDate("")
    setOrderType("nacional")
    setOrderCurrency("MXN")
    setOrderExchangeRate("1")
    setOrderExchangeRateStatus({
      loading: false,
      message: "Se actualiza automáticamente desde Banxico según la moneda seleccionada.",
      sourceLabel: "",
    })
    setOrderVigenciaHasta("")
    setOrderProformaReferencia("")
    setOrderProformaFile(null)
    setOrderProformaFileName("")
    setOrderProformaInputKey((current) => current + 1)
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
    setOrderCondicionesComercialesObservaciones("")
    setOrderFormaPago("")
    setOrderPorcentajeAnticipo("")
    setOrderMomentoPagoSaldo("")
    setOrderDiasCredito("")
    setOrderDatosBancariosProveedor("")
    setOrderCondicionesPagoObservaciones("")
    setOrderPaymentSchedules([])
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
    setEditingOrderMontoAsegurado(false)
    setOrderLogisticaObservaciones("")
    setOrderLines([createEmptyOrderLine()])
    setOrderDocumentUploadSlots({})
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        orderHydratingRef.current = false
      }, 0)
    } else {
      orderHydratingRef.current = false
    }
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
    setEditingPaymentScheduleRecord(null)
    setEditingReceptionLineCostIndex(null)
    const currentOrder = openOrders.find((orden) => String(orden.id) === orderId) ?? null
    setLines(buildLinesFromOrder(currentOrder))
    setSelectedWarehouseId((currentOrder?.almacen_destino_id as string | undefined) || defaultWarehouseId)
  }

  const showResumen = activeView === "resumen"
  const showAlmacenes = activeView === "almacenes"
  const showProveedores = activeView === "proveedores"
  const showOrdenes = activeView === "ordenes"
  const showPedimentos = activeView === "pedimentos"
  const showAgentes = activeView === "agentes"
  const showInventario = activeView === "inventario"
  const showRecepciones = activeView === "recepciones"

  useEffect(() => {
    if (!isOrderPaymentsModalOpen || selectedOrderPaymentSchedules.length === 0) {
      setPaymentMxnLookupByKey({})
      return
    }

    const requestId = ++paymentMxnLookupRequestIdRef.current
    const abortController = new AbortController()

    const run = async () => {
      const entries = await Promise.all(
        selectedOrderPaymentSchedules.map(async (row, index) => {
          const key = String(row.id ?? `${row.tipo_pago}-${index}`)
          const currency = asString(row.moneda_codigo, orderCurrency).trim().toUpperCase()
          const amount = asNumber(row.monto)
          const paymentDate = getPaymentNormalizationDate(row, orderEmissionIso)
          const storedTipoCambio = asNumber(row.tipo_cambio_aplicado)
          const storedMontoMxn = asNumber(row.monto_mxn)

          if (
            Number.isFinite(amount) &&
            amount > 0 &&
            Number.isFinite(storedTipoCambio) &&
            storedTipoCambio > 0 &&
            Number.isFinite(storedMontoMxn) &&
            storedMontoMxn > 0
          ) {
            return [
              key,
              {
                loading: false,
                tipoCambio: storedTipoCambio.toFixed(6).replace(/\.?0+$/, ""),
                montoMxn: storedMontoMxn.toFixed(2),
                fechaTipoCambio: paymentDate,
              },
            ] as const
          }

          if (!Number.isFinite(amount) || amount <= 0 || !currency) {
            return [key, { loading: false, tipoCambio: "", montoMxn: "", fechaTipoCambio: "" }] as const
          }

          if (currency === "MXN") {
            return [
              key,
              {
                loading: false,
                tipoCambio: "1",
                montoMxn: amount.toFixed(2),
                fechaTipoCambio: paymentDate,
              },
            ] as const
          }

          if (!paymentDate) {
            return [key, { loading: false, tipoCambio: "", montoMxn: "", fechaTipoCambio: "" }] as const
          }

          try {
            const response = await fetch(
              `/api/compras/tipo-cambio?moneda=${encodeURIComponent(currency)}&fecha=${encodeURIComponent(paymentDate)}`,
              {
                cache: "no-store",
                signal: abortController.signal,
              },
            )
            const data = (await response.json().catch(() => null)) as BanxicoTipoCambioResponse | { error?: string } | null
            const payload = isBanxicoTipoCambioResponse(data) ? data : null
            if (!response.ok || !payload) {
              return [key, { loading: false, tipoCambio: "", montoMxn: "", fechaTipoCambio: "" }] as const
            }
            const rate = Number(payload.tipo_cambio)
            if (!Number.isFinite(rate) || rate <= 0) {
              return [key, { loading: false, tipoCambio: "", montoMxn: "", fechaTipoCambio: "" }] as const
            }
            const amountMxn = amount * rate
            return [
              key,
              {
                loading: false,
                tipoCambio: rate.toFixed(6).replace(/\.?0+$/, ""),
                montoMxn: amountMxn.toFixed(2),
                fechaTipoCambio: asString(payload.fecha, paymentDate),
              },
            ] as const
          } catch {
            return [key, { loading: false, tipoCambio: "", montoMxn: "", fechaTipoCambio: "" }] as const
          }
        }),
      )

      if (requestId !== paymentMxnLookupRequestIdRef.current || abortController.signal.aborted) {
        return
      }
      setPaymentMxnLookupByKey(Object.fromEntries(entries))
    }

    void run()
    return () => abortController.abort()
  }, [isOrderPaymentsModalOpen, orderCurrency, orderEmissionIso, selectedOrderPaymentSchedules])

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
                      <TableCell>{asString(proveedor.nombre_comercial ?? proveedor.razon_social)}</TableCell>
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
        <Dialog open={isOrderModalOpen} onOpenChange={handleOrderModalOpenChange}>
          <DialogContent className="max-h-[92vh] max-w-7xl overflow-y-auto p-0">
            <DialogHeader className="sr-only">
              <DialogTitle>{editingOrderId ? "Editar orden de compra" : "Crear orden de compra"}</DialogTitle>
              <DialogDescription>
                Formulario de alta y edición de órdenes de compra.
              </DialogDescription>
            </DialogHeader>
            <Card className="border-0 shadow-none">
        <CardHeader>
          <CardTitle>{editingOrderId ? "Editar orden de compra" : "Crear orden de compra"}</CardTitle>
          <CardDescription>Selecciona proveedor, almacén y productos. Todo se guarda en una sola operación.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={handleOrderFormAction} className="space-y-5">
            <input type="hidden" name="fecha_emision" value={formatDateOnly(orderEmissionIso)} readOnly />
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
                  onChange={(event) => {
                    const nextType = event.target.value as "nacional" | "internacional"
                    setOrderType(nextType)
                    setOrderDocumentUploadSlots({})
                  }}
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
                  placeholder="Banxico"
                />
                <p className="text-xs text-muted-foreground">
                  {orderExchangeRateStatus.loading
                    ? "Consultando Banxico..."
                    : orderExchangeRateStatus.message}
                </p>
              </div>
              <div className="space-y-2 md:col-span-1">
                <label className="text-sm font-medium" htmlFor="orden-entrega">
                  F. Estimada de Recepcion
                </label>
                <Input
                  id="orden-entrega"
                  name="fecha_entrega_estimada"
                  type="date"
                  value={orderDueDate}
                  onChange={(event) => {
                    const nextValue = event.target.value
                    setOrderDueDate(nextValue)
                    setOrderFechaEstimadaArribo(nextValue)
                  }}
                />
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
                      {asString(proveedor.codigo_proveedor)} · {asString(proveedor.nombre_comercial ?? proveedor.razon_social)}
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
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" onClick={addOrderLine}>
                Agregar producto
              </Button>
            </div>
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Cantidad</TableHead>
                    <TableHead>Costo</TableHead>
                    <TableHead>Desc %</TableHead>
                    <TableHead className="w-32 text-right">Total</TableHead>
                    <TableHead>Observaciones</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orderLines.map((line, index) => (
                    <Fragment key={`${line.catalog_item_id || "new"}-${index}`}>
                      <TableRow>
                      <TableCell className="align-top">
                        <div className="w-full min-w-0 space-y-2">
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
                          {orderType === "internacional" ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-auto px-0 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                setExpandedOrderLineIndex((current) => (current === index ? null : index))
                              }
                            >
                              {expandedOrderLineIndex === index ? "Ocultar datos internacionales" : "Editar datos internacionales"}
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="w-28 align-top">
                        <Input
                          name="items_cantidad_solicitada"
                          type="number"
                          min="0"
                          step="0.001"
                          value={Number.isFinite(line.cantidad_solicitada) && line.cantidad_solicitada > 0 ? line.cantidad_solicitada : ""}
                          onChange={(event) =>
                            updateOrderLine(index, {
                              cantidad_solicitada: event.target.value === "" ? 0 : Number(event.target.value),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell className="w-36 align-top">
                        <Input
                          type="text"
                          inputMode="decimal"
                          min="0"
                          value={
                            editingOrderLineCostIndex === index
                              ? editingOrderLineCostDraft
                              : formatCurrencyInput(line.costo_unitario, orderCurrency, false)
                          }
                          onFocus={() => {
                            setEditingOrderLineCostIndex(index)
                            setEditingOrderLineCostDraft(
                              Number.isFinite(line.costo_unitario) && line.costo_unitario > 0
                                ? String(line.costo_unitario)
                                : "",
                            )
                          }}
                          onBlur={(event) => {
                            setEditingOrderLineCostIndex((current) => (current === index ? null : current))
                            setEditingOrderLineCostDraft("")
                            updateOrderLine(index, { costo_unitario: parseCurrencyInput(event.currentTarget.value) })
                          }}
                          onChange={(event) => setEditingOrderLineCostDraft(event.target.value)}
                          placeholder={formatCurrency(0, orderCurrency)}
                          className="text-right tabular-nums"
                        />
                        <input
                          type="hidden"
                          name="items_costo_unitario"
                          value={Number.isFinite(line.costo_unitario) ? line.costo_unitario : 0}
                          readOnly
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
                      <TableCell className="w-32 align-top">
                        <div className="pt-2 text-right text-sm font-medium tabular-nums">
                          {formatCurrency(calculateOrderLineTotal(line), orderCurrency)}
                        </div>
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
                      {orderType === "internacional" && expandedOrderLineIndex === index ? (
                        <TableRow>
                          <TableCell colSpan={7} className="whitespace-normal bg-muted/20 p-4 align-top">
                            <div className="space-y-4">
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
                                  Ocultar
                                </Button>
                              </div>
                              <div className="space-y-4">
                                <div className="grid gap-4 xl:grid-cols-[minmax(180px,220px)_minmax(0,1fr)]">
                                  <div className="space-y-2 min-w-0">
                                    <label className="text-xs font-medium" htmlFor={`item-numero-partida-${index}`}>
                                      Número de partida
                                    </label>
                                    <Input
                                      id={`item-numero-partida-${index}`}
                                      type="number"
                                      min="1"
                                      step="1"
                                      value={line.numero_partida}
                                      onChange={(event) => updateOrderLine(index, { numero_partida: event.target.value })}
                                    />
                                  </div>
                                  <div className="space-y-2 min-w-0">
                                    <label className="text-xs font-medium" htmlFor={`item-descripcion-${index}`}>
                                      Descripción
                                    </label>
                                    <Textarea
                                      id={`item-descripcion-${index}`}
                                      className="min-h-20"
                                      value={line.descripcion}
                                      onChange={(event) => updateOrderLine(index, { descripcion: event.target.value })}
                                      rows={3}
                                    />
                                  </div>
                                </div>

                                <div className="grid gap-4 xl:grid-cols-3">
                                  <div className="space-y-2 min-w-0">
                                    <label className="text-xs font-medium" htmlFor={`item-marca-${index}`}>
                                      Marca
                                    </label>
                                    <Input
                                      id={`item-marca-${index}`}
                                      value={line.marca}
                                      onChange={(event) => updateOrderLine(index, { marca: event.target.value })}
                                    />
                                  </div>
                                  <div className="space-y-2 min-w-0">
                                    <label className="text-xs font-medium" htmlFor={`item-modelo-${index}`}>
                                      Modelo
                                    </label>
                                    <Input
                                      id={`item-modelo-${index}`}
                                      value={line.modelo}
                                      onChange={(event) => updateOrderLine(index, { modelo: event.target.value })}
                                    />
                                  </div>
                                  <div className="space-y-2 min-w-0">
                                    <label className="text-xs font-medium" htmlFor={`item-fabricante-${index}`}>
                                      Fabricante
                                    </label>
                                    <Input
                                      id={`item-fabricante-${index}`}
                                      value={line.fabricante}
                                      onChange={(event) => updateOrderLine(index, { fabricante: event.target.value })}
                                    />
                                  </div>
                                </div>

                                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,0.9fr)]">
                                  <div className="space-y-2 min-w-0">
                                    <label className="text-xs font-medium">País origen</label>
                                    <ContactCatalogSelect
                                      value={line.pais_origen_codigo_iso2}
                                      onValueChange={(value) => updateOrderLine(index, { pais_origen_codigo_iso2: value })}
                                      options={mergeCatalogOptions(paisesOptions, line.pais_origen_codigo_iso2)}
                                      placeholder="Selecciona país"
                                      emptyLabel="Sin países cargados"
                                    />
                                  </div>
                                  <div className="space-y-2 min-w-0">
                                    <label className="text-xs font-medium">País procedencia</label>
                                    <ContactCatalogSelect
                                      value={line.pais_procedencia_codigo_iso2}
                                      onValueChange={(value) => updateOrderLine(index, { pais_procedencia_codigo_iso2: value })}
                                      options={mergeCatalogOptions(paisesOptions, line.pais_procedencia_codigo_iso2)}
                                      placeholder="Selecciona país"
                                      emptyLabel="Sin países cargados"
                                    />
                                  </div>
                                  <div className="space-y-2 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <label className="text-xs font-medium" htmlFor={`item-hs-${index}`}>
                                        HS code
                                      </label>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <button
                                            type="button"
                                            className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                                            aria-label="Qué es HS code"
                                          >
                                            <Info className="size-3" />
                                          </button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top">
                                          Código internacional armonizado que identifica la mercancía a nivel global.
                                        </TooltipContent>
                                      </Tooltip>
                                    </div>
                                    <Input
                                      id={`item-hs-${index}`}
                                      value={line.hs_code}
                                      onChange={(event) => updateOrderLine(index, { hs_code: event.target.value })}
                                    />
                                  </div>
                                  <div className="space-y-2 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <label className="text-xs font-medium" htmlFor={`item-fraccion-${index}`}>
                                        Fracción <span className="text-muted-foreground">(Cumplimiento MEX)</span>
                                      </label>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <button
                                            type="button"
                                            className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                                            aria-label="Qué es fracción arancelaria"
                                          >
                                            <Info className="size-3" />
                                          </button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top">
                                          Subpartida arancelaria usada en México para clasificación aduanal.
                                        </TooltipContent>
                                      </Tooltip>
                                    </div>
                                    <Input
                                      id={`item-fraccion-${index}`}
                                      value={line.fraccion_arancelaria}
                                      onChange={(event) => updateOrderLine(index, { fraccion_arancelaria: event.target.value })}
                                    />
                                  </div>
                                  <div className="space-y-2 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <label className="text-xs font-medium" htmlFor={`item-nico-${index}`}>
                                        NICO <span className="text-muted-foreground">(Cumplimiento MEX)</span>
                                      </label>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <button
                                            type="button"
                                            className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                                            aria-label="Qué es NICO"
                                          >
                                            <Info className="size-3" />
                                          </button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top">
                                          Complemento mexicano de la fracción para identificar con más precisión la mercancía.
                                        </TooltipContent>
                                      </Tooltip>
                                    </div>
                                    <Input
                                      id={`item-nico-${index}`}
                                      value={line.nico}
                                      onChange={(event) => updateOrderLine(index, { nico: event.target.value })}
                                    />
                                  </div>
                                </div>

                                <div className="grid gap-4 xl:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.4fr)]">
                                  <div className="space-y-2 min-w-0">
                                    <label className="text-xs font-medium" htmlFor={`item-peso-neto-${index}`}>
                                      Peso neto
                                    </label>
                                    <Input
                                      id={`item-peso-neto-${index}`}
                                      type="number"
                                      min="0"
                                      step="0.0001"
                                      value={line.peso_neto}
                                      onChange={(event) => updateOrderLine(index, { peso_neto: event.target.value })}
                                    />
                                  </div>
                                  <div className="space-y-2 min-w-0">
                                    <label className="text-xs font-medium" htmlFor={`item-peso-bruto-${index}`}>
                                      Peso bruto
                                    </label>
                                    <Input
                                      id={`item-peso-bruto-${index}`}
                                      type="number"
                                      min="0"
                                      step="0.0001"
                                      value={line.peso_bruto}
                                      onChange={(event) => updateOrderLine(index, { peso_bruto: event.target.value })}
                                    />
                                  </div>
                                  <div className="space-y-2 min-w-0">
                                    <label className="text-xs font-medium" htmlFor={`item-volumen-${index}`}>
                                      Volumen CBM
                                    </label>
                                    <Input
                                      id={`item-volumen-${index}`}
                                      type="number"
                                      min="0"
                                      step="0.0001"
                                      value={line.volumen_cbm}
                                      onChange={(event) => updateOrderLine(index, { volumen_cbm: event.target.value })}
                                    />
                                  </div>
                                  <div className="space-y-2 min-w-0">
                                    <label className="text-xs font-medium" htmlFor={`item-lote-${index}`}>
                                      Lote / serie / caducidad
                                    </label>
                                    <div className="grid gap-3 md:grid-cols-3">
                                      <Input
                                        id={`item-lote-${index}`}
                                        value={line.lote}
                                        onChange={(event) => updateOrderLine(index, { lote: event.target.value })}
                                        placeholder="Lote"
                                      />
                                      <Input
                                        id={`item-serie-${index}`}
                                        value={line.numero_serie}
                                        onChange={(event) => updateOrderLine(index, { numero_serie: event.target.value })}
                                        placeholder="Serie"
                                      />
                                      <Input
                                        id={`item-caducidad-${index}`}
                                        type="date"
                                        value={line.fecha_caducidad}
                                        onChange={(event) => updateOrderLine(index, { fecha_caducidad: event.target.value })}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Subtotal moneda</div>
                <div className="mt-1 text-lg font-semibold tabular-nums">{formatCurrency(orderSubtotal, orderCurrency)}</div>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Tipo de cambio</div>
                <div className="mt-1 text-lg font-semibold tabular-nums">
                  {orderExchangeRate ? `${orderExchangeRate} ${orderCurrency}/MXN` : "—"}
                </div>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Subtotal MXN</div>
                <div className="mt-1 text-lg font-semibold tabular-nums">
                  {orderSubtotalMxn !== null ? formatCurrency(orderSubtotalMxn, "MXN") : "—"}
                </div>
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
              <div className="grid gap-4 md:grid-cols-8">
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
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium" htmlFor="orden-proforma">
                      Proforma
                    </label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                          aria-label="Qué es proforma"
                        >
                          <Info className="size-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        Documento preliminar enviado por el vendedor que sirve como base para la orden de compra.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    id="orden-proforma"
                    name="proforma_referencia"
                    value={orderProformaReferencia}
                    onChange={(event) => setOrderProformaReferencia(event.target.value)}
                    placeholder="PI-12345"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="orden-proforma-file">
                    Archivo PI
                  </label>
                  <Input
                    key={orderProformaInputKey}
                    id="orden-proforma-file"
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null
                      setOrderProformaFile(file)
                      setOrderProformaFileName(file?.name ?? "")
                    }}
                  />
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {orderProformaFileName
                        ? `Archivo seleccionado: ${orderProformaFileName}`
                        : selectedOrderHasProforma
                          ? "La orden ya tiene una PI adjunta."
                          : "Adjunta aquí la cotización del vendedor en PDF."}
                    </span>
                    {selectedOrderProformaHref ? (
                      <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
                        <a href={selectedOrderProformaHref} target="_blank" rel="noreferrer">
                          Ver PI
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium" htmlFor="orden-incoterm">
                      Incoterm
                    </label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                          aria-label="Qué es incoterm"
                        >
                          <Info className="size-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        Regla internacional que define responsabilidades, costos y riesgos entre comprador y vendedor.
                      </TooltipContent>
                    </Tooltip>
                  </div>
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
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium" htmlFor="orden-lugar-incoterm">
                      Lugar
                    </label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                          aria-label="Qué es lugar de incoterm"
                        >
                          <Info className="size-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        Punto exacto acordado en el Incoterm, por ejemplo puerto, aeropuerto o bodega.
                      </TooltipContent>
                    </Tooltip>
                  </div>
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
                    <select
                      id="orden-resp-flete"
                      name="condiciones_comerciales_responsable_flete"
                      value={orderResponsableFlete}
                      onChange={(event) => setOrderResponsableFlete(event.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Selecciona una opción</option>
                      <option value="comprador">Comprador</option>
                      <option value="vendedor">Vendedor</option>
                    </select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium" htmlFor="orden-resp-seguro">
                      Quién paga seguro
                    </label>
                    <select
                      id="orden-resp-seguro"
                      name="condiciones_comerciales_responsable_seguro"
                      value={orderResponsableSeguro}
                      onChange={(event) => setOrderResponsableSeguro(event.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Selecciona una opción</option>
                      <option value="comprador">Comprador</option>
                      <option value="vendedor">Vendedor</option>
                    </select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium" htmlFor="orden-resp-desp-export">
                      Despacho exportación
                    </label>
                    <select
                      id="orden-resp-desp-export"
                      name="condiciones_comerciales_responsable_despacho_exportacion"
                      value={orderResponsableDespachoExportacion}
                      onChange={(event) => setOrderResponsableDespachoExportacion(event.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Selecciona una opción</option>
                      <option value="comprador">Comprador</option>
                      <option value="vendedor">Vendedor</option>
                    </select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium" htmlFor="orden-resp-desp-import">
                      Despacho importación
                    </label>
                    <select
                      id="orden-resp-desp-import"
                      name="condiciones_comerciales_responsable_despacho_importacion"
                      value={orderResponsableDespachoImportacion}
                      onChange={(event) => setOrderResponsableDespachoImportacion(event.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Selecciona una opción</option>
                      <option value="comprador">Comprador</option>
                      <option value="vendedor">Vendedor</option>
                    </select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium" htmlFor="orden-resp-impuestos">
                      Impuestos importación
                    </label>
                    <select
                      id="orden-resp-impuestos"
                      name="condiciones_comerciales_responsable_impuestos_importacion"
                      value={orderResponsableImpuestosImportacion}
                      onChange={(event) => setOrderResponsableImpuestosImportacion(event.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Selecciona una opción</option>
                      <option value="comprador">Comprador</option>
                      <option value="vendedor">Vendedor</option>
                    </select>
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
                    type="text"
                    value={formatCurrency(orderMontoAnticipoDisplay, orderCurrency)}
                    readOnly
                    className="bg-muted/40 text-right tabular-nums"
                  />
                  <input
                    type="hidden"
                    name="condiciones_pago_monto_anticipo"
                    value={orderMontoAnticipoDisplay.toFixed(4)}
                    readOnly
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
                    value={formatDecimalInput(orderPorcentajeSaldoCalculated)}
                    readOnly
                    className="bg-muted/40"
                  />
                </div>
                <div className="space-y-2 md:col-span-1">
                  <label className="text-sm font-medium" htmlFor="orden-monto-saldo">
                    Monto saldo
                  </label>
                  <Input
                    id="orden-monto-saldo"
                    type="text"
                    value={formatCurrency(orderMontoSaldoDisplay, orderCurrency)}
                    readOnly
                    className="bg-muted/40 text-right tabular-nums"
                  />
                  <input
                    type="hidden"
                    name="condiciones_pago_monto_saldo"
                    value={orderMontoSaldoDisplay.toFixed(4)}
                    readOnly
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="orden-momento-saldo">
                    Inicio del cómputo del saldo
                  </label>
                  <div className="text-xs text-muted-foreground">
                    Evento desde el que empiezan a correr los días de crédito del saldo.
                  </div>
                  <select
                    id="orden-momento-saldo"
                    name="condiciones_pago_momento_pago_saldo"
                    value={orderMomentoPagoSaldo}
                    onChange={(event) => setOrderMomentoPagoSaldo(event.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {paymentEventOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
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
                    Datos bancarios proveedor
                  </label>
                  <Input
                    id="orden-datos-bancarios-proveedor"
                    name="condiciones_pago_datos_bancarios_proveedor"
                    value={orderDatosBancariosProveedor}
                    onChange={(event) => setOrderDatosBancariosProveedor(event.target.value)}
                    placeholder="Cuenta, banco, CLABE, SWIFT"
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
            <div className="rounded-xl border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
              Los pagos programados se gestionan después de guardar la orden. Abre una orden guardada para registrar anticipo, saldo o pagos parciales.
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
                    Fecha de recoleccion
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
                    F. Estimada de Recepcion
                  </label>
                  <Input
                    id="orden-fecha-arribo"
                    name="logistica_fecha_estimada_arribo"
                    type="date"
                    value={orderFechaEstimadaArribo || orderDueDate}
                    readOnly
                    className="bg-muted/40"
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
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium" htmlFor="orden-tipo-embarque">
                      Tipo embarque
                    </label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                          aria-label="Qué es tipo embarque"
                        >
                          <Info className="size-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        Modalidad logística del envío, por ejemplo FCL, LCL o courier.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input id="orden-tipo-embarque" name="logistica_tipo_embarque" value={orderTipoEmbarque} onChange={(event) => setOrderTipoEmbarque(event.target.value)} placeholder="FCL / LCL / courier" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium" htmlFor="orden-tipo-contenedor">
                      Tipo contenedor
                    </label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                          aria-label="Qué es tipo contenedor"
                        >
                          <Info className="size-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        Tipo físico del contenedor usado en el embarque, por ejemplo 20&apos; o 40&apos;.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input id="orden-tipo-contenedor" name="logistica_tipo_contenedor" value={orderTipoContenedor} onChange={(event) => setOrderTipoContenedor(event.target.value)} placeholder="20' / 40' / etc." />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium" htmlFor="orden-forwarder">
                      Forwarder
                    </label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                          aria-label="Qué es forwarder"
                        >
                          <Info className="size-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        Es la empresa que coordina el transporte internacional de la mercancía.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input id="orden-forwarder" name="logistica_forwarder_nombre" value={orderForwarderNombre} onChange={(event) => setOrderForwarderNombre(event.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium" htmlFor="orden-booking">
                      Booking
                    </label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                          aria-label="Qué es booking"
                        >
                          <Info className="size-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        Número de reserva asignado por la naviera o aerolínea para el embarque.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input id="orden-booking" name="logistica_numero_booking" value={orderNumeroBooking} onChange={(event) => setOrderNumeroBooking(event.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium" htmlFor="orden-bl-awb">
                      BL / AWB
                    </label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                          aria-label="Qué es BL o AWB"
                        >
                          <Info className="size-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        Conocimiento de embarque marítimo (BL) o guía aérea (AWB) del envío.
                      </TooltipContent>
                    </Tooltip>
                  </div>
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
                <Input
                  id="orden-monto-asegurado"
                  type="text"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={editingOrderMontoAsegurado ? orderMontoAsegurado : formatCurrency(asNumber(orderMontoAsegurado), orderCurrency)}
                  onFocus={() => setEditingOrderMontoAsegurado(true)}
                  onBlur={() => {
                    setEditingOrderMontoAsegurado(false)
                    setOrderMontoAsegurado(String(parseCurrencyInput(orderMontoAsegurado)))
                  }}
                  onChange={(event) => setOrderMontoAsegurado(event.target.value)}
                  placeholder={formatCurrency(0, orderCurrency)}
                  className="text-right tabular-nums"
                />
                <input
                  type="hidden"
                  name="logistica_monto_asegurado"
                  value={parseCurrencyInput(orderMontoAsegurado)}
                  readOnly
                />
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
            <div className="rounded-xl border border-border/70 bg-muted/10 p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Documentos de la orden</div>
                  <div className="text-xs text-muted-foreground">
                    Adjunta los soportes requeridos según el tipo de operación. La PI se carga arriba como archivo base.
                  </div>
                </div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  {orderType === "internacional" ? "Internacional" : "Nacional"}
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {orderDocumentDefinitions.map((definition) => {
                  const selectedDocuments = selectedOrderDocumentsByType.get(definition.tipoDocumento) ?? []
                  const uploadSlots = orderDocumentUploadSlots[definition.tipoDocumento] ?? []
                  return (
                    <div key={definition.tipoDocumento} className="rounded-lg border border-border/60 bg-background p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground">{definition.label}</div>
                          <div className="text-xs text-muted-foreground">{definition.help}</div>
                        </div>
                        <div
                          className={[
                            "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
                            selectedDocuments.length
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : definition.requiredByDefault
                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                : "border-border bg-muted text-muted-foreground",
                          ].join(" ")}
                        >
                          {selectedDocuments.length
                            ? `Cargado ${selectedDocuments.length}`
                            : definition.requiredByDefault
                              ? "Base"
                              : "Opcional"}
                        </div>
                      </div>
                      <div className="mt-3 space-y-2">
                        <div className="text-xs text-muted-foreground">
                          Agrega uno o varios archivos PDF. Cada fila guarda un archivo.
                        </div>
                        <div className="space-y-2">
                          {uploadSlots.map((slot, index) => {
                            return (
                              <div key={slot.id} className="space-y-1 rounded-md border border-dashed border-border/60 bg-muted/20 p-2">
                                <input
                                  id={`orden-doc-${definition.tipoDocumento}-${slot.id}`}
                                  type="file"
                                  accept=".pdf,application/pdf"
                                  className="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                                  onChange={(event) => {
                                    const file = event.currentTarget.files?.[0] ?? null
                                    const fileName = file?.name ?? ""
                                    setOrderDocumentUploadSlots((current) => {
                                      const currentSlots = current[definition.tipoDocumento] ?? []
                                      const nextSlots = currentSlots.map((currentSlot) =>
                                        currentSlot.id === slot.id ? { ...currentSlot, file, fileName } : currentSlot,
                                      )
                                      const isLastSlot = index === currentSlots.length - 1
                                      if (file && isLastSlot) {
                                        nextSlots.push(createEmptyDocumentUploadSlot())
                                      }
                                      return {
                                        ...current,
                                        [definition.tipoDocumento]: nextSlots,
                                      }
                                    })
                                  }}
                                />
                                <div className="text-[11px] text-muted-foreground">
                                  {slot.fileName ? `Seleccionado: ${slot.fileName}` : "Sin archivo seleccionado"}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                        {selectedDocuments.length ? (
                          <div className="space-y-2 text-xs text-muted-foreground">
                            <div className="flex items-center justify-between gap-2">
                              <span>{selectedDocuments.length} archivo(s) cargado(s)</span>
                            </div>
                            <div className="space-y-1">
                              {selectedDocuments.map((documento, index) => {
                                const documentoArchivo =
                                  documento.archivo && typeof documento.archivo === "object"
                                    ? (documento.archivo as AnyRecord)
                                    : null
                                const documentoMetadata =
                                  documentoArchivo?.metadata && typeof documentoArchivo.metadata === "object"
                                    ? (documentoArchivo.metadata as AnyRecord)
                                    : null
                                const nombreDocumento = asString(
                                  documentoArchivo?.nombre_original ?? documentoMetadata?.nombre_original ?? "archivo",
                                )
                                const documentoId = asString(documento.id, "")
                                const documentoHref = selectedOrderRecord?.id && documentoId
                                  ? `/api/compras/ordenes/${selectedOrderRecord.id}/documentos/${documentoId}`
                                  : null
                                return (
                                  <div
                                    key={`${definition.tipoDocumento}-${index}`}
                                    className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1"
                                  >
                                    {documentoHref ? (
                                      <a
                                        href={documentoHref}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="truncate text-primary underline-offset-4 hover:underline"
                                        title="Abrir documento"
                                      >
                                        {nombreDocumento}
                                      </a>
                                    ) : (
                                      <span className="truncate">{nombreDocumento}</span>
                                    )}
                                    {documentoId ? (
                                      <Button
                                        type="submit"
                                        formAction={deleteOrdenCompraDocumentoAction.bind(
                                          null,
                                          String(selectedOrderRecord?.id ?? ""),
                                          documentoId,
                                        )}
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-2 text-[11px] text-destructive hover:text-destructive"
                                        onClick={(event) => {
                                          const confirmed = window.confirm(
                                            "¿Eliminar este archivo adjunto? Esta acción no se puede deshacer.",
                                          )
                                          if (!confirmed) {
                                            event.preventDefault()
                                          }
                                        }}
                                      >
                                        Eliminar
                                      </Button>
                                    ) : null}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">Sin archivos adjuntos.</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
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
          </DialogContent>
        </Dialog>
      ) : null}

      <Dialog open={isOrderPaymentsModalOpen && Boolean(selectedOrderRecord)} onOpenChange={handleOrderPaymentsModalOpenChange}>
        <DialogContent className="max-h-[92vh] w-[95vw] max-w-7xl overflow-y-auto p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Pagos de O.C.</DialogTitle>
            <DialogDescription>Gestiona anticipos, saldos, pagos parciales y gastos ligados a la orden seleccionada.</DialogDescription>
          </DialogHeader>
          {selectedOrderRecord ? (
            <Card className="border-0 shadow-none">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Pagos de O.C.</CardTitle>
                <CardDescription>
                  Gestiona anticipos, saldos, pagos parciales y otros gastos ligados a una orden ya guardada.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium" htmlFor="pagos-orden">
                  Orden de compra
                </label>
                <select
                  id="pagos-orden"
                  value={selectedOrderId}
                  onChange={(event) => {
                    const nextOrderId = event.target.value
                    setSelectedOrderId(nextOrderId)
                    const nextOrder = ordenes.find((orden) => String(orden.id) === nextOrderId) ?? null
                    if (nextOrder) {
                      setOrderPaymentSchedules(buildOrderPaymentScheduleExtrasFromOrder(nextOrder))
                      setEditingPaymentScheduleRecord(null)
                      setEditingPaymentScheduleAmountIndex(null)
                      setEditingRegisteredPaymentAmountFocused(false)
                    }
                  }}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="" disabled>
                    Selecciona una orden
                  </option>
                  {ordenes.map((orden) => (
                    <option key={String(orden.id)} value={String(orden.id)}>
                      {asString(orden.folio)} · {asString((orden.proveedor as AnyRecord | undefined)?.nombre_comercial ?? (orden.proveedor as AnyRecord | undefined)?.razon_social, "Proveedor")}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2 md:col-span-1">
                <label className="text-sm font-medium">Tipo</label>
                <Input value={selectedOrderRecord ? getOrderStatusBadge(selectedOrderRecord.estado).label : "—"} readOnly className="bg-muted/40" />
              </div>
            </div>
            {selectedOrderPedimento ? (
              <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-3 text-sm">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Pedimento asociado</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm">{selectedOrderPedimento.numero_pedimento}</span>
                  {selectedOrderPedimento.estado ? (
                    <span className="rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                      {selectedOrderPedimento.estado}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}

            {selectedOrderRecord ? (
              <>
              <form action={saveOrdenCompraPagosProgramadosAction.bind(null, String(selectedOrderRecord.id))} className="space-y-5">
                <div className="rounded-lg border border-border/60 bg-background/80 p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pagos derivados</div>
                      <div className="text-xs text-muted-foreground">
                        Calculados desde las condiciones de la orden y visibles solo como resumen.
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-2">
                    {derivedPaymentSchedules.map((row, index) => {
                      const eventLabel = paymentEventOptions.find((option) => option.value === row.evento_base)?.label ?? row.evento_base
                      return (
                        <div key={`derived-${row.tipo_pago}-${index}`} className="rounded-md border border-border/60 bg-muted/30 p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="text-sm font-semibold capitalize">{row.tipo_pago}</div>
                            <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                              {row.estado}
                            </span>
                          </div>
                          <div className={`grid gap-2 text-xs ${row.tipo_pago === "saldo" ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                            <div className="rounded-md bg-background/70 p-2">
                              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Evento</div>
                              <div className="mt-1 font-medium">{eventLabel}</div>
                            </div>
                            <div className="rounded-md bg-background/70 p-2">
                              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Monto</div>
                              <div className="mt-1 font-medium">{row.monto ? formatCurrency(row.monto, row.moneda_codigo) : "—"}</div>
                            </div>
                            {row.tipo_pago !== "saldo" ? (
                              <div className="rounded-md bg-background/70 p-2">
                                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Fecha</div>
                                <div className="mt-1 font-medium">{getPaymentDisplayDate(row, formatDateOnly(orderEmissionIso) || "—")}</div>
                              </div>
                            ) : null}
                            <div className="rounded-md bg-background/70 p-2">
                              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Vencimiento</div>
                              <div className="mt-1 font-medium">{getPaymentDisplayDueLabel(row)}</div>
                            </div>
                            {row.tipo_pago === "saldo" ? (
                              <div className="rounded-md bg-background/70 p-2">
                                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Saldo restante</div>
                                <div className="mt-1 font-medium">
                                  {selectedOrderSaldoLimit > 0
                                    ? formatCurrency(selectedOrderSaldoRemaining, row.moneda_codigo || selectedOrderCurrency)
                                    : "—"}
                                </div>
                              </div>
                            ) : null}
                            {row.tipo_pago === "anticipo" ? (
                              <div className="rounded-md bg-background/70 p-2">
                                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Saldo anticipo</div>
                                <div className="mt-1 font-medium">
                                  {selectedOrderAnticipoLimit > 0
                                    ? formatCurrency(selectedOrderAnticipoRemaining, row.moneda_codigo || selectedOrderCurrency)
                                    : "—"}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="rounded-lg border border-border/60 bg-background/80 p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pagos registrados</div>
                      <div className="text-xs text-muted-foreground">
                        Movimientos ya guardados para esta orden. Aquí se reflejan anticipos, saldos y abonos reales.
                      </div>
                    </div>
                    <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                      {selectedOrderPaymentSchedules.length} registrados
                    </span>
                  </div>
                  {selectedOrderPaymentSchedules.length > 0 ? (
                    <>
                      <div className="overflow-x-auto rounded-md border border-border/60 bg-background/60">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Tipo</TableHead>
                              <TableHead>Estado</TableHead>
                              <TableHead>Evento</TableHead>
                              <TableHead>Monto</TableHead>
                              <TableHead>Tipo cambio</TableHead>
                              <TableHead>Monto MXN</TableHead>
                              <TableHead>Fecha recepción</TableHead>
                              <TableHead>Fecha pago</TableHead>
                              <TableHead>Vencimiento</TableHead>
                              <TableHead>Referencia</TableHead>
                              <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedOrderPaymentSchedules.map((row, index) => {
                              const eventLabel =
                                paymentEventOptions.find((option) => option.value === asString(row.evento_base, ""))?.label ??
                                asString(row.evento_base, "")
                              const dueLabel = getPaymentDisplayDueLabel(row)
                              const isSaldo = asString(row.tipo_pago, "") === "saldo"
                              const paymentDate = getPaymentDisplayDate(row, "—")
                              const receiptDate = asString(row.fecha_evento_real, "") || "—"
                              const showReceipt = isSaldo && index === firstRegisteredSaldoIndex
                              const lookupKey = String(row.id ?? `${row.tipo_pago}-${index}`)
                              const normalized = paymentMxnLookupByKey[lookupKey]
                              const rowId = asString(row.id, "")
                              return (
                                <TableRow key={String(row.id ?? `${row.tipo_pago}-${index}`)}>
                                  <TableCell className="whitespace-nowrap capitalize">{getPaymentTypeLabel(row.tipo_pago)}</TableCell>
                                  <TableCell>
                                    <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                                      {asString(row.estado, "programado")}
                                    </span>
                                  </TableCell>
                                  <TableCell className="min-w-40">{eventLabel}</TableCell>
                                  <TableCell className="whitespace-nowrap">
                                    {asString(row.monto, "") ? formatCurrency(asNumber(row.monto), asString(row.moneda_codigo, orderCurrency)) : "—"}
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap">
                                    {normalized && asString(normalized.tipoCambio, "") ? normalized.tipoCambio : "—"}
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap">
                                    {normalized && asString(normalized.montoMxn, "") ? formatCurrency(normalized.montoMxn, "MXN") : "—"}
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap">{showReceipt ? receiptDate : "—"}</TableCell>
                                  <TableCell className="whitespace-nowrap">{paymentDate}</TableCell>
                                  <TableCell className="whitespace-nowrap">{dueLabel}</TableCell>
                                  <TableCell className="min-w-44">{asString(row.referencia_pago, "—")}</TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 px-2 text-xs"
                                        onClick={() => startEditRegisteredPayment(row)}
                                        disabled={!rowId}
                                      >
                                        Editar
                                      </Button>
                                      {rowId ? (
                                        <Button
                                          type="submit"
                                          formAction={deleteOrdenCompraPagoProgramadoAction.bind(
                                            null,
                                            String(selectedOrderRecord.id),
                                            rowId,
                                          )}
                                          variant="destructive"
                                          size="sm"
                                          className="h-8 px-2 text-xs"
                                          onClick={(event) => {
                                            const confirmed = window.confirm(
                                              "¿Eliminar este movimiento de pago? Esta acción no se puede deshacer.",
                                            )
                                            if (!confirmed) {
                                              event.preventDefault()
                                            }
                                          }}
                                        >
                                          Eliminar
                                        </Button>
                                      ) : null}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </div>
                      <div className="mt-3 flex items-center justify-end gap-3 rounded-md border border-border/60 bg-background/70 px-4 py-3 text-sm">
                        <span className="text-muted-foreground">Total normalizado en MXN</span>
                        <span className="font-semibold">{formatCurrency(selectedOrderPaymentsTotalMxn, "MXN")}</span>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border/70 bg-background/60 px-4 py-5 text-sm text-muted-foreground">
                      No hay pagos registrados todavía para esta orden.
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="rounded-lg border border-border/60 bg-background/80 p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {selectedOrderCompliancePaymentsSettled ? "Gastos" : "Pagos de O.C."}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {selectedOrderCompliancePaymentsSettled
                            ? "Registra aquí gastos ligados a la orden ya cumplida."
                            : "Selecciona la orden y registra aquí pagos de cumplimiento, abonos parciales o gastos ligados a esa O.C."}
                        </div>
                      </div>
                    </div>
                    {orderPaymentSchedules.length > 0 ? (
                      orderPaymentSchedules.map((row, index) => {
                        const isSaldoRow = row.tipo_pago === "saldo"
                        const showSaldoReceiptFields = isSaldoRow && !selectedOrderHasSaldoPayment && index === firstEditableSaldoIndex
                        return (
                          <div key={`${row.tipo_pago}-${index}`} className="rounded-lg border border-border/60 bg-muted/20 p-3 mb-3 last:mb-0">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              Movimiento {index + 1}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeOrderPaymentSchedule(index)}
                            >
                              Quitar
                            </Button>
                          </div>
                            <div className="grid gap-3 md:grid-cols-12">
                              <div className="space-y-2 md:col-span-2">
                                <label className="text-xs font-medium">Tipo</label>
                                <select
                                  name="pagos_programados_tipo_pago"
                                  value={row.tipo_pago}
                                  onChange={(event) =>
                                    updateOrderPaymentSchedule(index, { tipo_pago: event.target.value as OrderPaymentScheduleLine["tipo_pago"] })
                                  }
                                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                >
                                  {canCreateAnticipoPayment || row.tipo_pago === "anticipo" ? <option value="anticipo">Anticipo</option> : null}
                                  {canCreateSaldoPayment || row.tipo_pago === "saldo" ? <option value="saldo">Saldo</option> : null}
                                  <option value="parcial">Gasto</option>
                                </select>
                              </div>
                              <div className="space-y-2 md:col-span-4">
                                <label className="text-xs font-medium">Evento base</label>
                                <select
                                  name="pagos_programados_evento_base"
                                  value={row.evento_base}
                                  onChange={(event) => updateOrderPaymentSchedule(index, { evento_base: event.target.value })}
                                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                >
                                  {paymentEventOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="space-y-2 md:col-span-2">
                                <label className="text-xs font-medium">Monto</label>
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  value={
                                    editingPaymentScheduleAmountIndex === index
                                      ? row.monto
                                      : formatCurrency(asNumber(row.monto), row.moneda_codigo || orderCurrency)
                                  }
                                  onFocus={() => setEditingPaymentScheduleAmountIndex(index)}
                                  onBlur={() => {
                                    setEditingPaymentScheduleAmountIndex((current) => (current === index ? null : current))
                                    updateOrderPaymentSchedule(index, {
                                      monto: String(parseCurrencyInput(row.monto)),
                                    })
                                  }}
                                  onChange={(event) => updateOrderPaymentSchedule(index, { monto: event.target.value })}
                                  placeholder={formatCurrency(0, row.moneda_codigo || orderCurrency)}
                                  className="text-right tabular-nums"
                                />
                                <input
                                  type="hidden"
                                  name="pagos_programados_monto"
                                  value={parseCurrencyInput(row.monto)}
                                  readOnly
                                />
                              </div>
                              {row.tipo_pago === "parcial" ? (
                                <div className="space-y-2 md:col-span-2">
                                  <label className="text-xs font-medium">Moneda</label>
                                  <select
                                    name="pagos_programados_moneda_codigo"
                                    value={row.moneda_codigo}
                                    onChange={(event) => updateOrderPaymentSchedule(index, { moneda_codigo: event.target.value })}
                                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                  >
                                    {monedasOptions.map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              ) : (
                                <input
                                  type="hidden"
                                  name="pagos_programados_moneda_codigo"
                                  value={orderCurrency}
                                  readOnly
                                />
                              )}
                              {showSaldoReceiptFields ? (
                                <>
                                  <div className="space-y-2 md:col-span-2">
                                    <label className="text-xs font-medium">Fecha recepción</label>
                                    <Input
                                      name="pagos_programados_fecha_evento_real"
                                      type="date"
                                      value={row.fecha_evento_real}
                                      onChange={(event) =>
                                        updateOrderPaymentSchedule(index, {
                                          fecha_evento_real: event.target.value,
                                          fecha_vencimiento_calculada: calculatePaymentScheduleDueDate(
                                            event.target.value,
                                            row.dias_credito,
                                          ),
                                        })
                                      }
                                    />
                                  </div>
                                  <div className="space-y-2 md:col-span-2">
                                    <label className="text-xs font-medium">Fecha pago</label>
                                    <Input
                                      name="pagos_programados_fecha_pago_real"
                                      type="date"
                                      value={row.fecha_pago_real}
                                      onChange={(event) => updateOrderPaymentSchedule(index, { fecha_pago_real: event.target.value })}
                                    />
                                  </div>
                                </>
                              ) : (
                                <div className="space-y-2 md:col-span-2">
                                  <label className="text-xs font-medium">Fecha pago</label>
                                  <Input
                                    name="pagos_programados_fecha_pago_real"
                                    type="date"
                                    value={row.fecha_pago_real}
                                    onChange={(event) => updateOrderPaymentSchedule(index, { fecha_pago_real: event.target.value })}
                                  />
                                  <Input
                                    name="pagos_programados_fecha_evento_real"
                                    type="hidden"
                                    value=""
                                    readOnly
                                  />
                                </div>
                              )}
                              <div className="space-y-2 md:col-span-2">
                                <label className="text-xs font-medium">Referencia</label>
                                <Input
                                  name="pagos_programados_referencia_pago"
                                  value={row.referencia_pago}
                                  onChange={(event) => updateOrderPaymentSchedule(index, { referencia_pago: event.target.value })}
                                  placeholder="Transferencia, folio, nota"
                                />
                              </div>
                              <div className="space-y-2 md:col-span-2">
                                <label className="text-xs font-medium">Estado</label>
                                <select
                                  name="pagos_programados_estado"
                                  value={row.estado}
                                  onChange={(event) =>
                                    updateOrderPaymentSchedule(index, { estado: event.target.value as OrderPaymentScheduleLine["estado"] })
                                  }
                                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                >
                                  <option value="programado">Programado</option>
                                  <option value="pendiente">Pendiente</option>
                                  <option value="parcial">Parcial</option>
                                  <option value="pagado">Pagado</option>
                                  <option value="vencido">Vencido</option>
                                  <option value="cancelado">Cancelado</option>
                                </select>
                              </div>
                              <div className="space-y-2 md:col-span-12">
                                <label className="text-xs font-medium">Observaciones</label>
                                <Textarea
                                  name="pagos_programados_observaciones"
                                  value={row.observaciones}
                                  onChange={(event) => updateOrderPaymentSchedule(index, { observaciones: event.target.value })}
                                  rows={2}
                                  placeholder="Notas del movimiento"
                                />
                              </div>
                            </div>
                          </div>
                      )
                    })
                  ) : (
                    <div className="rounded-lg border border-dashed border-border/70 bg-background/60 px-4 py-5 text-sm text-muted-foreground">
                      No hay movimientos registrados para esta orden. Agrega uno para registrar un anticipo, saldo o gasto.
                    </div>
                  )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Button type="button" variant="secondary" onClick={addOrderPaymentSchedule}>
                    Agregar movimiento
                  </Button>
                  <Button type="submit" disabled={!selectedOrderRecord}>
                    Guardar movimientos
                  </Button>
                </div>
                </form>
              {editingPaymentScheduleRecord ? (
                <form
                  action={updateOrdenCompraPagoProgramadoAction.bind(null, String(selectedOrderRecord.id), editingPaymentScheduleRecord.id)}
                  className="mt-4 rounded-lg border border-border/60 bg-background/80 p-3"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Editar movimiento</div>
                      <div className="text-xs text-muted-foreground">
                        Modifica el pago registrado y vuelve a guardar.
                      </div>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={cancelEditRegisteredPayment}>
                      Cancelar
                    </Button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-12">
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-xs font-medium">Tipo</label>
                      <select
                        name="pago_tipo_pago"
                        value={editingPaymentScheduleRecord.tipo_pago}
                        onChange={(event) =>
                          updateEditingRegisteredPayment({
                            tipo_pago: event.target.value as OrderPaymentScheduleLine["tipo_pago"],
                          })
                        }
                        className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        {canCreateAnticipoPayment || editingPaymentScheduleRecord.tipo_pago === "anticipo" ? (
                          <option value="anticipo">Anticipo</option>
                        ) : null}
                        {canCreateSaldoPayment || editingPaymentScheduleRecord.tipo_pago === "saldo" ? (
                          <option value="saldo">Saldo</option>
                        ) : null}
                        <option value="parcial">Gasto</option>
                      </select>
                    </div>
                    <div className="space-y-2 md:col-span-4">
                      <label className="text-xs font-medium">Evento base</label>
                      <select
                        name="pago_evento_base"
                        value={editingPaymentScheduleRecord.evento_base}
                        onChange={(event) => updateEditingRegisteredPayment({ evento_base: event.target.value })}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        {paymentEventOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-xs font-medium">Monto</label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={
                          editingRegisteredPaymentAmountFocused
                            ? editingPaymentScheduleRecord.monto
                            : formatCurrency(
                                asNumber(editingPaymentScheduleRecord.monto),
                                editingPaymentScheduleRecord.moneda_codigo || orderCurrency,
                              )
                        }
                        onFocus={() => setEditingRegisteredPaymentAmountFocused(true)}
                        onBlur={() => {
                          setEditingRegisteredPaymentAmountFocused(false)
                          updateEditingRegisteredPayment({
                            monto: String(parseCurrencyInput(editingPaymentScheduleRecord.monto)),
                          })
                        }}
                        onChange={(event) => updateEditingRegisteredPayment({ monto: event.target.value })}
                        placeholder={formatCurrency(0, editingPaymentScheduleRecord.moneda_codigo || orderCurrency)}
                        className="text-right tabular-nums"
                      />
                      <input type="hidden" name="pago_monto" value={parseCurrencyInput(editingPaymentScheduleRecord.monto)} readOnly />
                    </div>
                    {editingPaymentScheduleRecord.tipo_pago === "parcial" ? (
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-xs font-medium">Moneda</label>
                        <select
                          name="pago_moneda_codigo"
                          value={editingPaymentScheduleRecord.moneda_codigo}
                          onChange={(event) => updateEditingRegisteredPayment({ moneda_codigo: event.target.value })}
                          className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          {monedasOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <input type="hidden" name="pago_moneda_codigo" value={orderCurrency} readOnly />
                    )}
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-xs font-medium">Fecha recepción</label>
                      <Input
                        name="pago_fecha_evento_real"
                        type="date"
                        value={editingPaymentScheduleRecord.fecha_evento_real}
                        onChange={(event) =>
                          updateEditingRegisteredPayment({
                            fecha_evento_real: event.target.value,
                            fecha_vencimiento_calculada: calculatePaymentScheduleDueDate(
                              event.target.value,
                              editingPaymentScheduleRecord.dias_credito,
                            ),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-xs font-medium">Fecha pago</label>
                      <Input
                        name="pago_fecha_pago_real"
                        type="date"
                        value={editingPaymentScheduleRecord.fecha_pago_real}
                        onChange={(event) => updateEditingRegisteredPayment({ fecha_pago_real: event.target.value })}
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-xs font-medium">Días crédito</label>
                      <Input
                        name="pago_dias_credito"
                        type="number"
                        min="0"
                        step="1"
                        value={editingPaymentScheduleRecord.dias_credito}
                        onChange={(event) =>
                          updateEditingRegisteredPayment({
                            dias_credito: event.target.value,
                            fecha_vencimiento_calculada: calculatePaymentScheduleDueDate(
                              editingPaymentScheduleRecord.fecha_evento_real,
                              event.target.value,
                            ),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2 md:col-span-3">
                      <label className="text-xs font-medium">Vencimiento</label>
                      <Input
                        name="pago_fecha_vencimiento_calculada"
                        type="date"
                        value={editingPaymentScheduleRecord.fecha_vencimiento_calculada}
                        onChange={(event) => updateEditingRegisteredPayment({ fecha_vencimiento_calculada: event.target.value })}
                      />
                    </div>
                    <div className="space-y-2 md:col-span-3">
                      <label className="text-xs font-medium">Referencia</label>
                      <Input
                        name="pago_referencia_pago"
                        value={editingPaymentScheduleRecord.referencia_pago}
                        onChange={(event) => updateEditingRegisteredPayment({ referencia_pago: event.target.value })}
                        placeholder="Transferencia, folio, nota"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-3">
                      <label className="text-xs font-medium">Estado</label>
                      <select
                        name="pago_estado"
                        value={editingPaymentScheduleRecord.estado}
                        onChange={(event) =>
                          updateEditingRegisteredPayment({
                            estado: event.target.value as OrderPaymentScheduleLine["estado"],
                          })
                        }
                        className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="programado">Programado</option>
                        <option value="pendiente">Pendiente</option>
                        <option value="parcial">Parcial</option>
                        <option value="pagado">Pagado</option>
                        <option value="vencido">Vencido</option>
                        <option value="cancelado">Cancelado</option>
                      </select>
                    </div>
                    <div className="space-y-2 md:col-span-12">
                      <label className="text-xs font-medium">Observaciones</label>
                      <Textarea
                        name="pago_observaciones"
                        value={editingPaymentScheduleRecord.observaciones}
                        onChange={(event) => updateEditingRegisteredPayment({ observaciones: event.target.value })}
                        rows={2}
                        placeholder="Notas del movimiento"
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                    <Button type="button" variant="outline" onClick={cancelEditRegisteredPayment}>
                      Cancelar
                    </Button>
                    <Button type="submit">Guardar cambios</Button>
                  </div>
                </form>
              ) : null}
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-border/70 bg-background/60 px-4 py-5 text-sm text-muted-foreground">
                Selecciona una orden para administrar sus pagos y gastos.
              </div>
            )}
          </CardContent>
            </Card>
          ) : null}
        </DialogContent>
      </Dialog>

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
                      {asString(orden.folio)} · {asString((orden.proveedor as AnyRecord | undefined)?.nombre_comercial ?? (orden.proveedor as AnyRecord | undefined)?.razon_social, "Proveedor")}
                    </option>
                  ))}
                </select>
                  {selectedProvider ? (
                    <p className="text-xs text-muted-foreground">
                      Proveedor: <span className="font-medium text-foreground">{asString(selectedProvider.nombre_comercial ?? selectedProvider.razon_social)}</span>
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
                            value={Number.isFinite(line.cantidad_recibida) && line.cantidad_recibida > 0 ? line.cantidad_recibida : ""}
                            onChange={(event) =>
                              updateLine(index, {
                                cantidad_recibida: event.target.value === "" ? 0 : Number(event.target.value),
                              })
                            }
                            aria-label={`Recibido ${line.nombre}`}
                          />
                        </TableCell>
                        <TableCell className="w-36">
                            <Input
                              type="text"
                              inputMode="decimal"
                              min="0"
                              step="0.0001"
                              value={
                                editingReceptionLineCostIndex === index
                                  ? editingReceptionLineCostDraft
                                  : formatCurrencyInput(line.costo_unitario_real, selectedOrderCurrency, false)
                              }
                              onFocus={() => {
                                setEditingReceptionLineCostIndex(index)
                                setEditingReceptionLineCostDraft(
                                  Number.isFinite(line.costo_unitario_real) && line.costo_unitario_real > 0
                                    ? String(line.costo_unitario_real)
                                    : "",
                                )
                              }}
                              onBlur={(event) => {
                                setEditingReceptionLineCostIndex((current) => (current === index ? null : current))
                                setEditingReceptionLineCostDraft("")
                                updateLine(index, {
                                  costo_unitario_real: parseCurrencyInput(event.currentTarget.value),
                                })
                              }}
                              onChange={(event) => setEditingReceptionLineCostDraft(event.target.value)}
                              placeholder={formatCurrency(0, selectedOrderCurrency)}
                              className="text-right tabular-nums"
                              aria-label={`Costo unitario ${line.nombre}`}
                            />
                          <input
                            type="hidden"
                            name="items_costo_unitario_real"
                            value={Number.isFinite(line.costo_unitario_real) ? line.costo_unitario_real : 0}
                            readOnly
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
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <CardTitle>Órdenes de compra</CardTitle>
                <CardDescription />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" onClick={openCreateOrderModal}>
                  Crear Orden de Compra
                </Button>
                <Button type="button" variant="outline" onClick={() => selectedOrderRecord && openEditOrderModal(selectedOrderRecord)} disabled={!selectedOrderRecord}>
                  Editar
                </Button>
                <Button type="button" variant="outline" onClick={() => selectedOrderRecord && openOrderPayments(selectedOrderRecord)} disabled={!selectedOrderRecord}>
                  Pagos
                </Button>
                {selectedOrderRecord && selectedOrderStatus === "borrador" ? (
                  <form action={sendOrdenCompraAction.bind(null, String(selectedOrderRecord.id))}>
                    <Button type="submit" variant="secondary">
                      Enviar
                    </Button>
                  </form>
                ) : (
                  <Button type="button" variant="secondary" disabled>
                    Enviar
                  </Button>
                )}
                {selectedOrderRecord && selectedOrderStatus === "enviada" ? (
                  <form action={approveOrdenCompraAction.bind(null, String(selectedOrderRecord.id))}>
                    <Button type="submit" variant="secondary">
                      Aprobar
                    </Button>
                  </form>
                ) : (
                  <Button type="button" variant="secondary" disabled>
                    Aprobar
                  </Button>
                )}
                {selectedOrderRecord ? (
                  <form action={deleteOrdenCompraAction.bind(null, String(selectedOrderRecord.id))}>
                    <Button type="submit" variant="ghost">
                      Eliminar
                    </Button>
                  </form>
                ) : (
                  <Button type="button" variant="ghost" disabled>
                    Eliminar
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-center">Tipo de O.C.</TableHead>
                  <TableHead className="text-center">Folio</TableHead>
                  <TableHead className="text-center">Proveedor</TableHead>
                  <TableHead className="text-center">Pedimento</TableHead>
                  <TableHead className="text-center">Almacén</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="text-center">Docs</TableHead>
                  <TableHead className="text-center">Pagos</TableHead>
                  <TableHead className="text-center">Fecha</TableHead>
                  <TableHead className="text-center">Auditoría</TableHead>
                  <TableHead className="text-center">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!ordenes.length ? (
                  <TableRow>
                    <TableCell colSpan={11} className="py-8 text-center text-sm text-muted-foreground">
                      Aún no hay órdenes de compra registradas.
                    </TableCell>
                  </TableRow>
                ) : (
                  ordenes.map((orden) => {
                    const orderId = String(orden.id)
                    const isSelected = selectedOrderId === orderId
                    const orderTypeLabel = String(orden.tipo_operacion ?? "").toLowerCase() === "internacional" ? "Internacional" : "Nacional"
                    const orderStatus = getOrderStatusBadge(orden.estado)
                    return (
                      <TableRow key={orderId} className={isSelected ? "bg-muted/40" : undefined}>
                        <TableCell>
                          <span className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold">
                            {orderTypeLabel}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{asString(orden.folio)}</TableCell>
                        <TableCell>
                          {asString(
                            (orden.proveedor as AnyRecord | undefined)?.nombre_comercial ??
                              (orden.proveedor as AnyRecord | undefined)?.razon_social,
                            "Proveedor",
                          )}
                        </TableCell>
                        <TableCell>
                          {orderPedimentoByOrderId.get(orderId) ? (
                            <div className="flex flex-col">
                              <span className="font-mono text-xs">{orderPedimentoByOrderId.get(orderId)?.numero_pedimento}</span>
                              <span className="text-[11px] text-muted-foreground">{orderPedimentoByOrderId.get(orderId)?.estado}</span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">Sin pedimento</span>
                          )}
                        </TableCell>
                        <TableCell>{asString((orden.almacen as AnyRecord | undefined)?.nombre, "Almacén")}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${orderStatus.className}`}>
                            {orderStatus.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {(() => {
                            const summary = getOrderDocumentsSummary(orden)
                            return (
                              <Button
                                type="button"
                                variant={summary.total > 0 ? "secondary" : "outline"}
                                size="sm"
                                className="h-10 min-w-16 flex-col gap-0.5 px-2.5 text-[10px] leading-none"
                                onClick={() => openEditOrderModal(orden)}
                                title={
                                  summary.total > 0
                                    ? `${summary.proforma} PI · ${summary.anexos} anexo${summary.anexos === 1 ? "" : "s"}`
                                    : "Sin documentos"
                                }
                              >
                                <span className="flex items-center gap-1 text-[11px] font-semibold">
                                  <Paperclip className="size-3.5" />
                                  {summary.total}
                                </span>
                                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                  {summary.proforma > 0 ? `${summary.proforma} PI` : "Sin PI"}
                                  {summary.anexos > 0 ? ` · ${summary.anexos} anexo${summary.anexos === 1 ? "" : "s"}` : ""}
                                </span>
                              </Button>
                            )
                          })()}
                        </TableCell>
                        <TableCell className="text-center">
                          {(() => {
                            const summary = getOrderPaymentsSummary(orden)
                            const detailParts = [
                              summary.anticipo ? `${summary.anticipo} anticipo${summary.anticipo === 1 ? "" : "s"}` : null,
                              summary.saldo ? `${summary.saldo} saldo${summary.saldo === 1 ? "" : "s"}` : null,
                              summary.parciales ? `${summary.parciales} parcial${summary.parciales === 1 ? "" : "es"}` : null,
                            ].filter(Boolean)
                            const label = detailParts.length ? detailParts.join(" · ") : "Sin pagos"
                            return (
                              <Button
                                type="button"
                                variant={summary.total > 0 ? "secondary" : "outline"}
                                size="sm"
                                className="h-10 min-w-20 flex-col gap-0.5 px-2.5 text-[10px] leading-none"
                                onClick={() => openOrderPayments(orden)}
                                title={summary.total > 0 ? label : "Sin pagos"}
                              >
                                <span className="text-[11px] font-semibold">{summary.total}</span>
                                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                  {summary.total > 0 ? label : "Sin pagos"}
                                </span>
                              </Button>
                            )
                          })()}
                        </TableCell>
                        <TableCell>{formatDateTime(orden.creado_en)}</TableCell>
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
                        <TableCell className="text-center">
                          <div className="inline-flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedOrderId(orderId)}
                            >
                              Seleccionar
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => openEditOrderModal(orden)}
                            >
                              Ver
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {showAgentes ? (
        <PedimentosImportacionPanel
          mode="agentes"
          agentes={agentesAduanales}
          pedimentos={pedimentosImportacion}
          ordenes={ordenes}
          monedas={monedas}
          selectedPedimento={selectedPedimento}
          selectedPedimentoId={selectedPedimentoId}
        />
      ) : null}

      {showPedimentos ? (
        <PedimentosImportacionPanel
          mode="pedimentos"
          agentes={agentesAduanales}
          pedimentos={pedimentosImportacion}
          ordenes={ordenes}
          monedas={monedas}
          selectedPedimento={selectedPedimento}
          selectedPedimentoId={selectedPedimentoId}
        />
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
