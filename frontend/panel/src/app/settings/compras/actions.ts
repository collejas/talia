"use server"

import { revalidatePath } from "next/cache"

import { callCrmApi } from "@/lib/api/crm"

const SETTINGS_PATH = "/settings/compras"

function parseBoolean(value: FormDataEntryValue | null, fallback = false): boolean {
  if (typeof value !== "string") return fallback
  const lowered = value.trim().toLowerCase()
  if (["true", "1", "t", "yes", "si", "on"].includes(lowered)) return true
  if (["false", "0", "f", "no", "off"].includes(lowered)) return false
  return fallback
}

function parseOptionalText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

function parseRequiredText(value: FormDataEntryValue | null, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field}_required`)
  }
  return value.trim()
}

function parseRequiredNumber(value: FormDataEntryValue | null, field: string): number {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field}_required`)
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`${field}_invalid`)
  }
  return parsed
}

function parseOptionalNumber(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  if (!trimmed.length) {
    return null
  }
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function getFormDataTextArray(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .map((value) => (typeof value === "string" ? value : ""))
}

function getFormDataNumberArray(formData: FormData, name: string, field: string): number[] {
  return formData.getAll(name).map((value) => parseRequiredNumber(value, field))
}

function zipOrderItems(formData: FormData): Record<string, unknown>[] {
  const catalogItemIds = getFormDataTextArray(formData, "items_catalog_item_id")
  const proveedorItemIds = getFormDataTextArray(formData, "items_proveedor_item_id")
  const cantidades = getFormDataNumberArray(formData, "items_cantidad_solicitada", "items_cantidad_solicitada")
  const unidades = getFormDataTextArray(formData, "items_unidad")
  const costos = getFormDataNumberArray(formData, "items_costo_unitario", "items_costo_unitario")
  const descuentos = formData.getAll("items_descuento_porcentaje").map((value) => parseOptionalNumber(value))
  const impuestos = formData.getAll("items_impuestos").map((value) => parseOptionalNumber(value) ?? 0)
  const observaciones = getFormDataTextArray(formData, "items_observaciones")

  const expectedLength = catalogItemIds.length
  if (!expectedLength) {
    throw new Error("items_required")
  }

  const arrays = [proveedorItemIds, cantidades, unidades, costos, descuentos, impuestos, observaciones]
  if (arrays.some((array) => array.length !== expectedLength)) {
    throw new Error("items_mismatch")
  }

  return catalogItemIds.map((catalogItemId, index) => ({
    catalog_item_id: parseRequiredText(catalogItemId, "items_catalog_item_id"),
    proveedor_item_id: parseOptionalText(proveedorItemIds[index]),
    cantidad_solicitada: cantidades[index],
    unidad: parseOptionalText(unidades[index]) ?? "unidad",
    costo_unitario: costos[index],
    descuento_porcentaje: descuentos[index],
    impuestos: impuestos[index],
    observaciones: parseOptionalText(observaciones[index]),
  }))
}

function zipReceptionItems(formData: FormData): Record<string, unknown>[] {
  const ordenCompraItemIds = getFormDataTextArray(formData, "items_orden_compra_item_id")
  const catalogItemIds = getFormDataTextArray(formData, "items_catalog_item_id")
  const cantidadesRecibidas = getFormDataNumberArray(formData, "items_cantidad_recibida", "items_cantidad_recibida")
  const costosUnitarios = getFormDataNumberArray(formData, "items_costo_unitario_real", "items_costo_unitario_real")
  const lotes = getFormDataTextArray(formData, "items_lote_codigo")
  const caducidades = getFormDataTextArray(formData, "items_fecha_caducidad")
  const series = getFormDataTextArray(formData, "items_serie")
  const observaciones = getFormDataTextArray(formData, "items_observaciones")

  const expectedLength = ordenCompraItemIds.length
  if (!expectedLength) {
    throw new Error("items_required")
  }

  const arrays = [
    catalogItemIds,
    cantidadesRecibidas,
    costosUnitarios,
    lotes,
    caducidades,
    series,
    observaciones,
  ]
  if (arrays.some((array) => array.length !== expectedLength)) {
    throw new Error("items_mismatch")
  }

  return ordenCompraItemIds.map((ordenCompraItemId, index) => ({
    orden_compra_item_id: parseRequiredText(ordenCompraItemId, "items_orden_compra_item_id"),
    catalog_item_id: parseRequiredText(catalogItemIds[index], "items_catalog_item_id"),
    cantidad_recibida: cantidadesRecibidas[index],
    costo_unitario_real: costosUnitarios[index],
    lote_codigo: parseOptionalText(lotes[index]),
    fecha_caducidad: parseOptionalText(caducidades[index]),
    serie: parseOptionalText(series[index]),
    observaciones: parseOptionalText(observaciones[index]),
  }))
}

export async function createAlmacenAction(formData: FormData): Promise<void> {
  const payload = {
    codigo: parseRequiredText(formData.get("codigo"), "codigo"),
    nombre: parseRequiredText(formData.get("nombre"), "nombre"),
    tipo: parseRequiredText(formData.get("tipo"), "tipo") as "central" | "sucursal" | "transito" | "consignacion",
    activo: parseBoolean(formData.get("activo"), true),
    es_principal: parseBoolean(formData.get("es_principal"), false),
    direccion_id: parseOptionalText(formData.get("direccion_id")),
    responsable_usuario_id: parseOptionalText(formData.get("responsable_usuario_id")),
    telefono: parseOptionalText(formData.get("telefono")),
    email: parseOptionalText(formData.get("email")),
  }

  const response = await callCrmApi("/crm/compras/almacenes", {
    method: "POST",
    body: payload,
  })
  if (!response.ok) {
    throw new Error(response.error)
  }
  revalidatePath(SETTINGS_PATH)
}

export async function updateAlmacenAction(almacenId: string, formData: FormData): Promise<void> {
  const payload = {
    codigo: parseRequiredText(formData.get("codigo"), "codigo"),
    nombre: parseRequiredText(formData.get("nombre"), "nombre"),
    tipo: parseRequiredText(formData.get("tipo"), "tipo") as "central" | "sucursal" | "transito" | "consignacion",
    activo: parseBoolean(formData.get("activo"), true),
    es_principal: parseBoolean(formData.get("es_principal"), false),
    direccion_id: parseOptionalText(formData.get("direccion_id")),
    responsable_usuario_id: parseOptionalText(formData.get("responsable_usuario_id")),
    telefono: parseOptionalText(formData.get("telefono")),
    email: parseOptionalText(formData.get("email")),
  }

  const response = await callCrmApi(`/crm/compras/almacenes/${almacenId}`, {
    method: "PATCH",
    body: payload,
  })
  if (!response.ok) {
    throw new Error(response.error)
  }
  revalidatePath(SETTINGS_PATH)
}

export async function deleteAlmacenAction(almacenId: string): Promise<void> {
  const response = await callCrmApi(`/crm/compras/almacenes/${almacenId}`, {
    method: "DELETE",
  })
  if (!response.ok) {
    throw new Error(response.error)
  }
  revalidatePath(SETTINGS_PATH)
}

export async function createProveedorAction(formData: FormData): Promise<void> {
  const payload = {
    codigo_proveedor: parseRequiredText(formData.get("codigo_proveedor"), "codigo_proveedor"),
    razon_social: parseRequiredText(formData.get("razon_social"), "razon_social"),
    nombre_comercial: parseOptionalText(formData.get("nombre_comercial")),
    rfc: parseOptionalText(formData.get("rfc")),
    correo: parseOptionalText(formData.get("correo")),
    telefono: parseOptionalText(formData.get("telefono")),
    plazo_pago_dias: parseOptionalNumber(formData.get("plazo_pago_dias")),
    plazo_entrega_dias: parseOptionalNumber(formData.get("plazo_entrega_dias")),
    limite_credito: parseOptionalNumber(formData.get("limite_credito")),
    moneda_preferida: parseOptionalText(formData.get("moneda_preferida")) || "MXN",
    activo: parseBoolean(formData.get("activo"), true),
    observaciones: parseOptionalText(formData.get("observaciones")),
  }

  const response = await callCrmApi("/crm/compras/proveedores", {
    method: "POST",
    body: payload,
  })
  if (!response.ok) {
    throw new Error(response.error)
  }
  revalidatePath(SETTINGS_PATH)
}

export async function updateProveedorAction(proveedorId: string, formData: FormData): Promise<void> {
  const payload = {
    codigo_proveedor: parseRequiredText(formData.get("codigo_proveedor"), "codigo_proveedor"),
    razon_social: parseRequiredText(formData.get("razon_social"), "razon_social"),
    nombre_comercial: parseOptionalText(formData.get("nombre_comercial")),
    rfc: parseOptionalText(formData.get("rfc")),
    correo: parseOptionalText(formData.get("correo")),
    telefono: parseOptionalText(formData.get("telefono")),
    plazo_pago_dias: parseOptionalNumber(formData.get("plazo_pago_dias")),
    plazo_entrega_dias: parseOptionalNumber(formData.get("plazo_entrega_dias")),
    limite_credito: parseOptionalNumber(formData.get("limite_credito")),
    moneda_preferida: parseOptionalText(formData.get("moneda_preferida")) || "MXN",
    activo: parseBoolean(formData.get("activo"), true),
    observaciones: parseOptionalText(formData.get("observaciones")),
  }

  const response = await callCrmApi(`/crm/compras/proveedores/${proveedorId}`, {
    method: "PATCH",
    body: payload,
  })
  if (!response.ok) {
    throw new Error(response.error)
  }
  revalidatePath(SETTINGS_PATH)
}

export async function deleteProveedorAction(proveedorId: string): Promise<void> {
  const response = await callCrmApi(`/crm/compras/proveedores/${proveedorId}`, {
    method: "DELETE",
  })
  if (!response.ok) {
    throw new Error(response.error)
  }
  revalidatePath(SETTINGS_PATH)
}

export async function createRecepcionAction(formData: FormData): Promise<void> {
  const items = zipReceptionItems(formData)
  const payload = {
    orden_compra_id: parseRequiredText(formData.get("orden_compra_id"), "orden_compra_id"),
    almacen_id: parseRequiredText(formData.get("almacen_id"), "almacen_id"),
    numero_recepcion: parseRequiredText(formData.get("numero_recepcion"), "numero_recepcion"),
    recibido_por_usuario_id: parseOptionalText(formData.get("recibido_por_usuario_id")),
    referencia_externa: parseOptionalText(formData.get("referencia_externa")),
    observaciones: parseOptionalText(formData.get("observaciones")),
    items,
  }

  const response = await callCrmApi("/crm/compras/recepciones", {
    method: "POST",
    body: payload,
  })
  if (!response.ok) {
    throw new Error(response.error)
  }
  revalidatePath(SETTINGS_PATH)
}

export async function createOrdenCompraAction(formData: FormData): Promise<void> {
  const items = zipOrderItems(formData)
  const payload = {
    folio: parseRequiredText(formData.get("folio"), "folio"),
    proveedor_id: parseRequiredText(formData.get("proveedor_id"), "proveedor_id"),
    almacen_destino_id: parseRequiredText(formData.get("almacen_destino_id"), "almacen_destino_id"),
    fecha_emision: parseOptionalText(formData.get("fecha_emision")),
    fecha_entrega_estimada: parseOptionalText(formData.get("fecha_entrega_estimada")),
    moneda: parseOptionalText(formData.get("moneda")) || "MXN",
    solicitado_por_usuario_id: parseOptionalText(formData.get("solicitado_por_usuario_id")),
    aprobado_por_usuario_id: parseOptionalText(formData.get("aprobado_por_usuario_id")),
    referencia_externa: parseOptionalText(formData.get("referencia_externa")),
    observaciones: parseOptionalText(formData.get("observaciones")),
    instrucciones_entrega: parseOptionalText(formData.get("instrucciones_entrega")),
    items,
  }

  const response = await callCrmApi("/crm/compras/ordenes", {
    method: "POST",
    body: payload,
  })
  if (!response.ok) {
    throw new Error(response.error)
  }
  revalidatePath(SETTINGS_PATH)
}

export async function updateOrdenCompraAction(ordenId: string, formData: FormData): Promise<void> {
  const items = zipOrderItems(formData)
  const payload = {
    proveedor_id: parseRequiredText(formData.get("proveedor_id"), "proveedor_id"),
    almacen_destino_id: parseRequiredText(formData.get("almacen_destino_id"), "almacen_destino_id"),
    folio: parseRequiredText(formData.get("folio"), "folio"),
    fecha_emision: parseOptionalText(formData.get("fecha_emision")),
    fecha_entrega_estimada: parseOptionalText(formData.get("fecha_entrega_estimada")),
    moneda: parseOptionalText(formData.get("moneda")) || "MXN",
    solicitado_por_usuario_id: parseOptionalText(formData.get("solicitado_por_usuario_id")),
    aprobado_por_usuario_id: parseOptionalText(formData.get("aprobado_por_usuario_id")),
    referencia_externa: parseOptionalText(formData.get("referencia_externa")),
    observaciones: parseOptionalText(formData.get("observaciones")),
    instrucciones_entrega: parseOptionalText(formData.get("instrucciones_entrega")),
    items,
  }

  const response = await callCrmApi(`/crm/compras/ordenes/${ordenId}`, {
    method: "PATCH",
    body: payload,
  })
  if (!response.ok) {
    throw new Error(response.error)
  }
  revalidatePath(SETTINGS_PATH)
}

export async function cancelOrdenCompraAction(ordenId: string): Promise<void> {
  const response = await callCrmApi(`/crm/compras/ordenes/${ordenId}`, {
    method: "PATCH",
    body: { estado: "cancelada" },
  })
  if (!response.ok) {
    throw new Error(response.error)
  }
  revalidatePath(SETTINGS_PATH)
}

export async function sendOrdenCompraAction(ordenId: string): Promise<void> {
  const response = await callCrmApi(`/crm/compras/ordenes/${ordenId}/enviar`, {
    method: "POST",
  })
  if (!response.ok) {
    throw new Error(response.error)
  }
  revalidatePath(SETTINGS_PATH)
}

export async function approveOrdenCompraAction(ordenId: string): Promise<void> {
  const response = await callCrmApi(`/crm/compras/ordenes/${ordenId}/aprobar`, {
    method: "POST",
  })
  if (!response.ok) {
    throw new Error(response.error)
  }
  revalidatePath(SETTINGS_PATH)
}

export async function closeOrdenCompraAction(ordenId: string): Promise<void> {
  const response = await callCrmApi(`/crm/compras/ordenes/${ordenId}/cerrar`, {
    method: "POST",
  })
  if (!response.ok) {
    throw new Error(response.error)
  }
  revalidatePath(SETTINGS_PATH)
}

export async function deleteOrdenCompraAction(ordenId: string): Promise<void> {
  const response = await callCrmApi(`/crm/compras/ordenes/${ordenId}`, {
    method: "DELETE",
  })
  if (!response.ok) {
    throw new Error(response.error)
  }
  revalidatePath(SETTINGS_PATH)
}
