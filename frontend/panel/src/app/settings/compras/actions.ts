"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { callCrmApi } from "@/lib/api/crm"

const SETTINGS_PATH = "/compras"

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

function getFormDataOptionalTextArray(formData: FormData, name: string): Array<string | null> {
  return formData.getAll(name).map((value) => parseOptionalText(value))
}

function getFormDataNumberArray(formData: FormData, name: string, field: string): number[] {
  return formData.getAll(name).map((value) => parseRequiredNumber(value, field))
}

function getFormDataOptionalNumberArray(formData: FormData, name: string): Array<number | null> {
  return formData.getAll(name).map((value) => parseOptionalNumber(value))
}

function getFormDataUniqueTextArray(formData: FormData, name: string): string[] {
  return Array.from(
    new Set(
      formData
        .getAll(name)
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((value) => value.length > 0),
    ),
  )
}

function getRecordText(value: unknown, key: string): string {
  if (!value || typeof value !== "object") {
    return ""
  }
  const record = value as Record<string, unknown>
  const nested = record[key]
  return typeof nested === "string" ? nested.trim() : ""
}

function zipOrderItems(formData: FormData): Record<string, unknown>[] {
  const catalogItemIds = getFormDataTextArray(formData, "items_catalog_item_id")
  const proveedorItemIds = getFormDataTextArray(formData, "items_proveedor_item_id")
  const numeroPartidas = getFormDataOptionalNumberArray(formData, "items_numero_partida")
  const cantidades = getFormDataNumberArray(formData, "items_cantidad_solicitada", "items_cantidad_solicitada")
  const unidades = getFormDataTextArray(formData, "items_unidad")
  const costos = getFormDataNumberArray(formData, "items_costo_unitario", "items_costo_unitario")
  const descuentos = formData.getAll("items_descuento_porcentaje").map((value) => parseOptionalNumber(value))
  const impuestos = formData.getAll("items_impuestos").map((value) => parseOptionalNumber(value) ?? 0)
  const descripciones = getFormDataOptionalTextArray(formData, "items_descripcion")
  const marcas = getFormDataOptionalTextArray(formData, "items_marca")
  const modelos = getFormDataOptionalTextArray(formData, "items_modelo")
  const fabricantes = getFormDataOptionalTextArray(formData, "items_fabricante")
  const paisOrigenes = getFormDataOptionalTextArray(formData, "items_pais_origen_codigo_iso2")
  const paisProcedencias = getFormDataOptionalTextArray(formData, "items_pais_procedencia_codigo_iso2")
  const fracciones = getFormDataOptionalTextArray(formData, "items_fraccion_arancelaria")
  const hsCodes = getFormDataOptionalTextArray(formData, "items_hs_code")
  const nicos = getFormDataOptionalTextArray(formData, "items_nico")
  const pesosNetos = getFormDataOptionalNumberArray(formData, "items_peso_neto")
  const pesosBrutos = getFormDataOptionalNumberArray(formData, "items_peso_bruto")
  const volumenes = getFormDataOptionalNumberArray(formData, "items_volumen_cbm")
  const lotes = getFormDataOptionalTextArray(formData, "items_lote")
  const numerosSerie = getFormDataOptionalTextArray(formData, "items_numero_serie")
  const fechasCaducidad = getFormDataOptionalTextArray(formData, "items_fecha_caducidad")
  const observaciones = getFormDataTextArray(formData, "items_observaciones")

  const expectedLength = catalogItemIds.length
  if (!expectedLength) {
    throw new Error("items_required")
  }

  const arrays = [
    proveedorItemIds,
    numeroPartidas,
    cantidades,
    unidades,
    costos,
    descuentos,
    impuestos,
    descripciones,
    marcas,
    modelos,
    fabricantes,
    paisOrigenes,
    paisProcedencias,
    fracciones,
    hsCodes,
    nicos,
    pesosNetos,
    pesosBrutos,
    volumenes,
    lotes,
    numerosSerie,
    fechasCaducidad,
    observaciones,
  ]
  if (arrays.some((array) => array.length !== expectedLength)) {
    throw new Error("items_mismatch")
  }

  return catalogItemIds.map((catalogItemId, index) => ({
    catalog_item_id: parseRequiredText(catalogItemId, "items_catalog_item_id"),
    proveedor_item_id: parseOptionalText(proveedorItemIds[index]),
    numero_partida: numeroPartidas[index],
    descripcion: descripciones[index],
    marca: marcas[index],
    modelo: modelos[index],
    fabricante: fabricantes[index],
    pais_origen_codigo_iso2: paisOrigenes[index],
    pais_procedencia_codigo_iso2: paisProcedencias[index],
    fraccion_arancelaria: fracciones[index],
    hs_code: hsCodes[index],
    nico: nicos[index],
    cantidad_solicitada: cantidades[index],
    unidad: parseOptionalText(unidades[index]) ?? "unidad",
    costo_unitario: costos[index],
    descuento_porcentaje: descuentos[index],
    impuestos: impuestos[index],
    peso_neto: pesosNetos[index],
    peso_bruto: pesosBrutos[index],
    volumen_cbm: volumenes[index],
    lote: lotes[index],
    numero_serie: numerosSerie[index],
    fecha_caducidad: parseOptionalText(fechasCaducidad[index]),
    observaciones: parseOptionalText(observaciones[index]),
  }))
}

function hasAnyValue(values: Array<unknown>): boolean {
  return values.some((value) => {
    if (typeof value === "string") {
      return value.trim().length > 0
    }
    if (typeof value === "number") {
      return Number.isFinite(value)
    }
    return Boolean(value)
  })
}

function normalizeDateInput(value: FormDataEntryValue | null): string | undefined {
  const raw = parseOptionalText(value)
  if (!raw) {
    return undefined
  }
  return raw.includes("T") ? raw.slice(0, 10) : raw.slice(0, 10)
}

async function syncPedimentoOrdenesImportacion(
  pedimentoId: string,
  selectedOrdenesIds: string[],
): Promise<void> {
  const response = await callCrmApi<Record<string, unknown>>(`/crm/compras/pedimentos/${pedimentoId}`, {
    method: "GET",
  })
  if (!response.ok || !response.data || typeof response.data !== "object") {
    throw new Error(response.ok ? "pedimento_importacion_not_found" : response.error || "pedimento_importacion_not_found")
  }

  const currentOrdenes = Array.isArray((response.data as Record<string, unknown>).ordenes_compra)
    ? ((response.data as Record<string, unknown>).ordenes_compra as Record<string, unknown>[])
    : []
  const currentIds = new Set(
    currentOrdenes
      .map((row) => String(row.orden_compra_id ?? getRecordText(row.orden_compra, "id") ?? "").trim())
      .filter((value) => value.length > 0),
  )
  const desiredIds = new Set(selectedOrdenesIds.map((value) => value.trim()).filter((value) => value.length > 0))

  for (const ordenId of currentIds) {
    if (!desiredIds.has(ordenId)) {
      const responseDetach = await callCrmApi(`/crm/compras/pedimentos/${pedimentoId}/ordenes/${ordenId}`, {
        method: "DELETE",
      })
      if (!responseDetach.ok) {
        throw new Error(responseDetach.error)
      }
    }
  }

  for (const ordenId of desiredIds) {
    if (!currentIds.has(ordenId)) {
      const responseAttach = await callCrmApi(`/crm/compras/pedimentos/${pedimentoId}/ordenes`, {
        method: "POST",
        body: {
          orden_compra_id: ordenId,
          rol: "principal",
        },
      })
      if (!responseAttach.ok) {
        throw new Error(responseAttach.error)
      }
    }
  }
}

function buildOrdenCompraCondicionesComerciales(formData: FormData, tipoOperacion: string): Record<string, unknown> | null {
  const payload = {
    incoterm_codigo: parseOptionalText(formData.get("condiciones_comerciales_incoterm_codigo")),
    incoterm_version: parseOptionalText(formData.get("condiciones_comerciales_incoterm_version")),
    lugar_incoterm: parseOptionalText(formData.get("condiciones_comerciales_lugar_incoterm")),
    responsable_flete: parseOptionalText(formData.get("condiciones_comerciales_responsable_flete")),
    responsable_seguro: parseOptionalText(formData.get("condiciones_comerciales_responsable_seguro")),
    responsable_despacho_exportacion: parseOptionalText(formData.get("condiciones_comerciales_responsable_despacho_exportacion")),
    responsable_despacho_importacion: parseOptionalText(formData.get("condiciones_comerciales_responsable_despacho_importacion")),
    responsable_impuestos_importacion: parseOptionalText(formData.get("condiciones_comerciales_responsable_impuestos_importacion")),
    permite_embarques_parciales: parseBoolean(formData.get("condiciones_comerciales_permite_embarques_parciales"), true),
    permite_transbordos: parseBoolean(formData.get("condiciones_comerciales_permite_transbordos"), true),
    gastos_bancarios: parseOptionalText(formData.get("condiciones_comerciales_gastos_bancarios")),
    observaciones: parseOptionalText(formData.get("condiciones_comerciales_observaciones")),
  }
  return tipoOperacion === "internacional" || hasAnyValue(Object.values(payload)) ? payload : null
}

function buildOrdenCompraCondicionesPago(formData: FormData, fallbackCurrency: string): Record<string, unknown> | null {
  const payload = {
    forma_pago: parseOptionalText(formData.get("condiciones_pago_forma_pago")),
    moneda_pago: parseOptionalText(formData.get("condiciones_pago_moneda_pago")) || fallbackCurrency,
    porcentaje_anticipo: parseOptionalNumber(formData.get("condiciones_pago_porcentaje_anticipo")),
    monto_anticipo: parseOptionalNumber(formData.get("condiciones_pago_monto_anticipo")),
    porcentaje_saldo: parseOptionalNumber(formData.get("condiciones_pago_porcentaje_saldo")),
    monto_saldo: parseOptionalNumber(formData.get("condiciones_pago_monto_saldo")),
    momento_pago_saldo: parseOptionalText(formData.get("condiciones_pago_momento_pago_saldo")),
    dias_credito: parseOptionalNumber(formData.get("condiciones_pago_dias_credito")),
    comisiones_bancarias: parseOptionalText(formData.get("condiciones_pago_comisiones_bancarias")),
    observaciones: parseOptionalText(formData.get("condiciones_pago_observaciones")),
  }
  const hasMeaningfulValue = hasAnyValue([
    payload.forma_pago,
    payload.porcentaje_anticipo,
    payload.monto_anticipo,
    payload.porcentaje_saldo,
    payload.monto_saldo,
    payload.momento_pago_saldo,
    payload.dias_credito,
    payload.comisiones_bancarias,
    payload.observaciones,
  ])
  return hasMeaningfulValue ? payload : null
}

function buildOrdenCompraPagosProgramados(formData: FormData): Record<string, unknown>[] {
  const tipos = getFormDataOptionalTextArray(formData, "pagos_programados_tipo_pago")
  const eventos = getFormDataOptionalTextArray(formData, "pagos_programados_evento_base")
  const porcentajes = getFormDataOptionalNumberArray(formData, "pagos_programados_porcentaje")
  const montos = getFormDataOptionalNumberArray(formData, "pagos_programados_monto")
  const monedas = getFormDataOptionalTextArray(formData, "pagos_programados_moneda_codigo")
  const diasCredito = getFormDataOptionalNumberArray(formData, "pagos_programados_dias_credito")
  const fechasVencimiento = getFormDataOptionalTextArray(formData, "pagos_programados_fecha_vencimiento_calculada")
  const fechasEventoReal = getFormDataOptionalTextArray(formData, "pagos_programados_fecha_evento_real")
  const fechasPagoReal = getFormDataOptionalTextArray(formData, "pagos_programados_fecha_pago_real")
  const referenciasPago = getFormDataOptionalTextArray(formData, "pagos_programados_referencia_pago")
  const estados = getFormDataOptionalTextArray(formData, "pagos_programados_estado")
  const observaciones = getFormDataOptionalTextArray(formData, "pagos_programados_observaciones")

  const expectedLength = Math.max(
    tipos.length,
    eventos.length,
    porcentajes.length,
    montos.length,
    monedas.length,
    diasCredito.length,
    fechasVencimiento.length,
    fechasEventoReal.length,
    fechasPagoReal.length,
    referenciasPago.length,
    estados.length,
    observaciones.length,
  )
  if (!expectedLength) {
    return []
  }

  const rows: Record<string, unknown>[] = []
  for (let index = 0; index < expectedLength; index += 1) {
    const tipoPago = parseOptionalText(tipos[index])
    const eventoBase = parseOptionalText(eventos[index])
    if (!tipoPago || !eventoBase) {
      continue
    }
    const porcentaje = porcentajes[index]
    const monto = montos[index]
    const dias = diasCredito[index]
    const fechaVencimiento = normalizeDateInput(fechasVencimiento[index])
    const fechaEventoReal = normalizeDateInput(fechasEventoReal[index])
    const fechaPagoReal = normalizeDateInput(fechasPagoReal[index])
    const referenciaPago = parseOptionalText(referenciasPago[index])
    const observacion = parseOptionalText(observaciones[index])
    const estado = parseOptionalText(estados[index])
    const hasMeaningfulValue =
      porcentaje !== null ||
      monto !== null ||
      dias !== null ||
      Boolean(fechaVencimiento) ||
      Boolean(observacion) ||
      (estado && estado !== "programado")
    if (!hasMeaningfulValue) {
      continue
    }
    rows.push({
      tipo_pago: tipoPago,
      evento_base: eventoBase,
      porcentaje,
      monto,
      moneda_codigo: parseOptionalText(monedas[index]),
      dias_credito: dias,
      ...(fechaVencimiento ? { fecha_vencimiento_calculada: fechaVencimiento } : {}),
      ...(fechaEventoReal ? { fecha_evento_real: fechaEventoReal } : {}),
      ...(fechaPagoReal ? { fecha_pago_real: fechaPagoReal } : {}),
      ...(referenciaPago ? { referencia_pago: referenciaPago } : {}),
      ...(estado ? { estado } : {}),
      ...(observacion ? { observaciones: observacion } : {}),
    })
  }
  return rows
}

function buildOrdenCompraPagoProgramadoPayload(formData: FormData, fallbackCurrency: string): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    tipo_pago: parseOptionalText(formData.get("pago_tipo_pago")),
    evento_base: parseOptionalText(formData.get("pago_evento_base")),
    porcentaje: parseOptionalNumber(formData.get("pago_porcentaje")),
    monto: parseOptionalNumber(formData.get("pago_monto")),
    moneda_codigo: parseOptionalText(formData.get("pago_moneda_codigo")) || fallbackCurrency,
    dias_credito: parseOptionalNumber(formData.get("pago_dias_credito")),
    fecha_vencimiento_calculada: normalizeDateInput(formData.get("pago_fecha_vencimiento_calculada")),
    fecha_evento_real: normalizeDateInput(formData.get("pago_fecha_evento_real")),
    fecha_pago_real: normalizeDateInput(formData.get("pago_fecha_pago_real")),
    referencia_pago: parseOptionalText(formData.get("pago_referencia_pago")),
    estado: parseOptionalText(formData.get("pago_estado")),
    observaciones: parseOptionalText(formData.get("pago_observaciones")),
  }
  return payload
}

async function uploadOrdenCompraDocumentAttachment(ordenId: string, tipoDocumento: string, file: File): Promise<void> {
  const payload = new FormData()
  payload.append("file", file, file.name || "documento.pdf")
  const response = await callCrmApi(`/crm/compras/ordenes/${ordenId}/documentos/${tipoDocumento}`, {
    method: "POST",
    body: payload,
  })
  if (!response.ok) {
    throw new Error(response.error)
  }
}

async function uploadOrdenCompraFormDocuments(ordenId: string, formData: FormData): Promise<void> {
  const uploads: Array<{ tipoDocumento: string; file: File }> = []
  const proformaFile = formData.get("proforma_file")
  if (proformaFile instanceof File && proformaFile.size > 0) {
    uploads.push({ tipoDocumento: "proforma", file: proformaFile })
  }
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("documento_file_")) continue
    if (!(value instanceof File) || value.size <= 0) continue
    const tipoDocumento = key.slice("documento_file_".length).trim().toLowerCase()
    if (!tipoDocumento) continue
    uploads.push({ tipoDocumento, file: value })
  }

  for (const upload of uploads) {
    await uploadOrdenCompraDocumentAttachment(ordenId, upload.tipoDocumento, upload.file)
  }
}

function buildOrdenCompraLogistica(formData: FormData, tipoOperacion: string): Record<string, unknown> | null {
  const payload = {
    modo_transporte_codigo: parseOptionalText(formData.get("logistica_modo_transporte_codigo")),
    fecha_requerida_embarque: parseOptionalText(formData.get("logistica_fecha_requerida_embarque")),
    fecha_estimada_embarque: parseOptionalText(formData.get("logistica_fecha_estimada_embarque")),
    fecha_estimada_arribo: parseOptionalText(formData.get("logistica_fecha_estimada_arribo")),
    puerto_origen: parseOptionalText(formData.get("logistica_puerto_origen")),
    puerto_destino: parseOptionalText(formData.get("logistica_puerto_destino")),
    aeropuerto_origen: parseOptionalText(formData.get("logistica_aeropuerto_origen")),
    aeropuerto_destino: parseOptionalText(formData.get("logistica_aeropuerto_destino")),
    lugar_entrega_final: parseOptionalText(formData.get("logistica_lugar_entrega_final")),
    direccion_entrega: parseOptionalText(formData.get("logistica_direccion_entrega")),
    tipo_embarque: parseOptionalText(formData.get("logistica_tipo_embarque")),
    tipo_contenedor: parseOptionalText(formData.get("logistica_tipo_contenedor")),
    forwarder_nombre: parseOptionalText(formData.get("logistica_forwarder_nombre")),
    numero_booking: parseOptionalText(formData.get("logistica_numero_booking")),
    numero_bl_awb: parseOptionalText(formData.get("logistica_numero_bl_awb")),
    tracking: parseOptionalText(formData.get("logistica_tracking")),
    peso_neto_total: parseOptionalNumber(formData.get("logistica_peso_neto_total")),
    peso_bruto_total: parseOptionalNumber(formData.get("logistica_peso_bruto_total")),
    volumen_total_cbm: parseOptionalNumber(formData.get("logistica_volumen_total_cbm")),
    cantidad_bultos: parseOptionalNumber(formData.get("logistica_cantidad_bultos")),
    tipo_empaque: parseOptionalText(formData.get("logistica_tipo_empaque")),
    marcas_embarque: parseOptionalText(formData.get("logistica_marcas_embarque")),
    requiere_seguro: parseBoolean(formData.get("logistica_requiere_seguro"), false),
    monto_asegurado: parseOptionalNumber(formData.get("logistica_monto_asegurado")),
    observaciones: parseOptionalText(formData.get("logistica_observaciones")),
  }
  return tipoOperacion === "internacional" || hasAnyValue(Object.values(payload)) ? payload : null
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

export async function createAgenteAduanalAction(formData: FormData): Promise<void> {
  const payload = {
    nombre: parseRequiredText(formData.get("nombre"), "nombre"),
    patente: parseOptionalText(formData.get("patente")),
    razon_social: parseOptionalText(formData.get("razon_social")),
    rfc: parseOptionalText(formData.get("rfc")),
    contacto: parseOptionalText(formData.get("contacto")),
    telefono: parseOptionalText(formData.get("telefono")),
    email: parseOptionalText(formData.get("email")),
    direccion: parseOptionalText(formData.get("direccion")),
    activo: parseBoolean(formData.get("activo"), true),
    observaciones: parseOptionalText(formData.get("observaciones")),
  }

  const response = await callCrmApi("/crm/compras/agentes-aduanales", {
    method: "POST",
    body: payload,
  })
  if (!response.ok) {
    throw new Error(response.error)
  }
  revalidatePath(SETTINGS_PATH)
}

export async function updateAgenteAduanalAction(agenteId: string, formData: FormData): Promise<void> {
  const payload = {
    nombre: parseRequiredText(formData.get("nombre"), "nombre"),
    patente: parseOptionalText(formData.get("patente")),
    razon_social: parseOptionalText(formData.get("razon_social")),
    rfc: parseOptionalText(formData.get("rfc")),
    contacto: parseOptionalText(formData.get("contacto")),
    telefono: parseOptionalText(formData.get("telefono")),
    email: parseOptionalText(formData.get("email")),
    direccion: parseOptionalText(formData.get("direccion")),
    activo: parseBoolean(formData.get("activo"), true),
    observaciones: parseOptionalText(formData.get("observaciones")),
  }

  const response = await callCrmApi(`/crm/compras/agentes-aduanales/${agenteId}`, {
    method: "PATCH",
    body: payload,
  })
  if (!response.ok) {
    throw new Error(response.error)
  }
  revalidatePath(SETTINGS_PATH)
}

export async function deleteAgenteAduanalAction(agenteId: string): Promise<void> {
  const response = await callCrmApi(`/crm/compras/agentes-aduanales/${agenteId}`, {
    method: "DELETE",
  })
  if (!response.ok) {
    throw new Error(response.error)
  }
  revalidatePath(SETTINGS_PATH)
}

export async function createPedimentoImportacionAction(formData: FormData): Promise<void> {
  const ordenesCompraIds = getFormDataUniqueTextArray(formData, "ordenes_compra_ids")
  const payload = {
    numero_pedimento: parseRequiredText(formData.get("numero_pedimento"), "numero_pedimento"),
    agente_aduanal_id: parseOptionalText(formData.get("agente_aduanal_id")),
    estado: (parseOptionalText(formData.get("estado")) || "borrador") as
      | "borrador"
      | "en_integracion"
      | "presentado"
      | "pagado"
      | "cerrado"
      | "cancelado",
    fecha_pedimento: parseOptionalText(formData.get("fecha_pedimento")),
    fecha_presentacion: parseOptionalText(formData.get("fecha_presentacion")),
    fecha_liberacion: parseOptionalText(formData.get("fecha_liberacion")),
    moneda: parseOptionalText(formData.get("moneda")) || "MXN",
    tipo_cambio: parseOptionalNumber(formData.get("tipo_cambio")),
    subtotal_aduanal: parseOptionalNumber(formData.get("subtotal_aduanal")) ?? 0,
    observaciones: parseOptionalText(formData.get("observaciones")),
  }

  const response = await callCrmApi("/crm/compras/pedimentos", {
    method: "POST",
    body: payload,
  })
  if (!response.ok) {
    throw new Error(response.error)
  }
  const pedimentoId = typeof response.data === "object" && response.data !== null ? String((response.data as { id?: string }).id ?? "") : ""
  if (pedimentoId && ordenesCompraIds.length > 0) {
    await syncPedimentoOrdenesImportacion(pedimentoId, ordenesCompraIds)
  }
  revalidatePath(SETTINGS_PATH)
}

export async function updatePedimentoImportacionAction(pedimentoId: string, formData: FormData): Promise<void> {
  const ordenesCompraIds = getFormDataUniqueTextArray(formData, "ordenes_compra_ids")
  const payload = {
    numero_pedimento: parseOptionalText(formData.get("numero_pedimento")),
    agente_aduanal_id: parseOptionalText(formData.get("agente_aduanal_id")),
    estado: parseOptionalText(formData.get("estado")) as
      | "borrador"
      | "en_integracion"
      | "presentado"
      | "pagado"
      | "cerrado"
      | "cancelado"
      | null,
    fecha_pedimento: parseOptionalText(formData.get("fecha_pedimento")),
    fecha_presentacion: parseOptionalText(formData.get("fecha_presentacion")),
    fecha_liberacion: parseOptionalText(formData.get("fecha_liberacion")),
    moneda: parseOptionalText(formData.get("moneda")),
    tipo_cambio: parseOptionalNumber(formData.get("tipo_cambio")),
    subtotal_aduanal: parseOptionalNumber(formData.get("subtotal_aduanal")),
    observaciones: parseOptionalText(formData.get("observaciones")),
  }

  const response = await callCrmApi(`/crm/compras/pedimentos/${pedimentoId}`, {
    method: "PATCH",
    body: payload,
  })
  if (!response.ok) {
    throw new Error(response.error)
  }
  await syncPedimentoOrdenesImportacion(pedimentoId, ordenesCompraIds)
  revalidatePath(SETTINGS_PATH)
}

export async function deletePedimentoImportacionAction(pedimentoId: string): Promise<void> {
  const response = await callCrmApi(`/crm/compras/pedimentos/${pedimentoId}`, {
    method: "DELETE",
  })
  if (!response.ok) {
    throw new Error(response.error)
  }
  revalidatePath(SETTINGS_PATH)
}

export async function recalcularPedimentoImportacionAction(pedimentoId: string): Promise<void> {
  const response = await callCrmApi(`/crm/compras/pedimentos/${pedimentoId}/recalcular`, {
    method: "POST",
  })
  if (!response.ok) {
    throw new Error(response.error)
  }
  revalidatePath(SETTINGS_PATH)
}

export async function attachPedimentoOrdenAction(pedimentoId: string, formData: FormData): Promise<void> {
  const payload = {
    orden_compra_id: parseRequiredText(formData.get("orden_compra_id"), "orden_compra_id"),
    rol: (parseOptionalText(formData.get("rol")) || "principal") as "principal" | "complementaria" | "parcial",
    observaciones: parseOptionalText(formData.get("observaciones")),
  }

  const response = await callCrmApi(`/crm/compras/pedimentos/${pedimentoId}/ordenes`, {
    method: "POST",
    body: payload,
  })
  if (!response.ok) {
    throw new Error(response.error)
  }
  revalidatePath(SETTINGS_PATH)
}

export async function detachPedimentoOrdenAction(pedimentoId: string, ordenCompraId: string): Promise<void> {
  const response = await callCrmApi(`/crm/compras/pedimentos/${pedimentoId}/ordenes/${ordenCompraId}`, {
    method: "DELETE",
  })
  if (!response.ok) {
    throw new Error(response.error)
  }
  revalidatePath(SETTINGS_PATH)
}

export async function createPedimentoGastoAction(pedimentoId: string, formData: FormData): Promise<void> {
  const payload = {
    agente_aduanal_id: parseOptionalText(formData.get("agente_aduanal_id")),
    tipo_gasto: parseRequiredText(formData.get("tipo_gasto"), "tipo_gasto"),
    descripcion: parseOptionalText(formData.get("descripcion")),
    monto: parseRequiredNumber(formData.get("monto"), "monto"),
    moneda: parseOptionalText(formData.get("moneda")) || "MXN",
    tipo_cambio: parseOptionalNumber(formData.get("tipo_cambio")) ?? 1,
    fecha_gasto: parseOptionalText(formData.get("fecha_gasto")),
    referencia_factura: parseOptionalText(formData.get("referencia_factura")),
    archivo_id: parseOptionalText(formData.get("archivo_id")),
    estado: (parseOptionalText(formData.get("estado")) || "registrado") as
      | "pendiente"
      | "registrado"
      | "pagado"
      | "cancelado",
    observaciones: parseOptionalText(formData.get("observaciones")),
  }

  const response = await callCrmApi(`/crm/compras/pedimentos/${pedimentoId}/gastos`, {
    method: "POST",
    body: payload,
  })
  if (!response.ok) {
    throw new Error(response.error)
  }
  revalidatePath(SETTINGS_PATH)
}

export async function deletePedimentoGastoAction(pedimentoId: string, gastoId: string): Promise<void> {
  const response = await callCrmApi(`/crm/compras/pedimentos/${pedimentoId}/gastos/${gastoId}`, {
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

export async function createInventarioAjusteAction(formData: FormData): Promise<void> {
  const payload = {
    catalog_item_id: parseRequiredText(formData.get("catalog_item_id"), "catalog_item_id"),
    almacen_id: parseRequiredText(formData.get("almacen_id"), "almacen_id"),
    sentido: parseRequiredText(formData.get("sentido"), "sentido") as "entrada" | "salida",
    cantidad: parseRequiredNumber(formData.get("cantidad"), "cantidad"),
    motivo: parseOptionalText(formData.get("motivo")),
  }

  const response = await callCrmApi("/crm/compras/inventario/ajustes", {
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
  const tipoOperacion = (parseOptionalText(formData.get("tipo_operacion")) || "nacional").toLowerCase()
  const moneda = parseOptionalText(formData.get("moneda")) || "MXN"
  const payload = {
    folio: parseRequiredText(formData.get("folio"), "folio"),
    proveedor_id: parseRequiredText(formData.get("proveedor_id"), "proveedor_id"),
    almacen_destino_id: parseRequiredText(formData.get("almacen_destino_id"), "almacen_destino_id"),
    fecha_emision: parseOptionalText(formData.get("fecha_emision")),
    fecha_entrega_estimada: parseOptionalText(formData.get("fecha_entrega_estimada")),
    moneda,
    tipo_operacion: tipoOperacion === "internacional" ? "internacional" : "nacional",
    tipo_cambio_referencia: parseOptionalNumber(formData.get("tipo_cambio_referencia")),
    vigencia_hasta: parseOptionalText(formData.get("vigencia_hasta")),
    proforma_referencia: parseOptionalText(formData.get("proforma_referencia")),
    solicitado_por_usuario_id: parseOptionalText(formData.get("solicitado_por_usuario_id")),
    aprobado_por_usuario_id: parseOptionalText(formData.get("aprobado_por_usuario_id")),
    referencia_externa: parseOptionalText(formData.get("referencia_externa")),
    observaciones: parseOptionalText(formData.get("observaciones")),
    instrucciones_entrega: parseOptionalText(formData.get("instrucciones_entrega")),
    condiciones_comerciales: buildOrdenCompraCondicionesComerciales(formData, tipoOperacion),
    condiciones_pago: buildOrdenCompraCondicionesPago(formData, moneda),
    logistica: buildOrdenCompraLogistica(formData, tipoOperacion),
    items,
  }

  const response = await callCrmApi("/crm/compras/ordenes", {
    method: "POST",
    body: payload,
  })
  if (!response.ok) {
    throw new Error(response.error)
  }
  const createdOrderId = typeof response.data === "object" && response.data !== null ? String((response.data as { id?: string }).id ?? "") : ""
  if (createdOrderId) {
    await uploadOrdenCompraFormDocuments(createdOrderId, formData)
  }
  revalidatePath(SETTINGS_PATH)
}

export async function updateOrdenCompraAction(ordenId: string, formData: FormData): Promise<void> {
  const items = zipOrderItems(formData)
  const tipoOperacion = (parseOptionalText(formData.get("tipo_operacion")) || "nacional").toLowerCase()
  const moneda = parseOptionalText(formData.get("moneda")) || "MXN"
  const payload = {
    proveedor_id: parseRequiredText(formData.get("proveedor_id"), "proveedor_id"),
    almacen_destino_id: parseRequiredText(formData.get("almacen_destino_id"), "almacen_destino_id"),
    folio: parseRequiredText(formData.get("folio"), "folio"),
    fecha_emision: parseOptionalText(formData.get("fecha_emision")),
    fecha_entrega_estimada: parseOptionalText(formData.get("fecha_entrega_estimada")),
    moneda,
    tipo_operacion: tipoOperacion === "internacional" ? "internacional" : "nacional",
    tipo_cambio_referencia: parseOptionalNumber(formData.get("tipo_cambio_referencia")),
    vigencia_hasta: parseOptionalText(formData.get("vigencia_hasta")),
    proforma_referencia: parseOptionalText(formData.get("proforma_referencia")),
    solicitado_por_usuario_id: parseOptionalText(formData.get("solicitado_por_usuario_id")),
    aprobado_por_usuario_id: parseOptionalText(formData.get("aprobado_por_usuario_id")),
    referencia_externa: parseOptionalText(formData.get("referencia_externa")),
    observaciones: parseOptionalText(formData.get("observaciones")),
    instrucciones_entrega: parseOptionalText(formData.get("instrucciones_entrega")),
    condiciones_comerciales: buildOrdenCompraCondicionesComerciales(formData, tipoOperacion),
    condiciones_pago: buildOrdenCompraCondicionesPago(formData, moneda),
    logistica: buildOrdenCompraLogistica(formData, tipoOperacion),
    items,
  }

  const response = await callCrmApi(`/crm/compras/ordenes/${ordenId}`, {
    method: "PATCH",
    body: payload,
  })
  if (!response.ok) {
    throw new Error(response.error)
  }
  await uploadOrdenCompraFormDocuments(ordenId, formData)
  revalidatePath(SETTINGS_PATH)
}

export async function saveOrdenCompraPagosProgramadosAction(ordenId: string, formData: FormData): Promise<void> {
  const pagosProgramados = buildOrdenCompraPagosProgramados(formData)
  for (const pago of pagosProgramados) {
    const response = await callCrmApi(`/crm/compras/ordenes/${ordenId}/pagos-programados`, {
      method: "POST",
      body: pago,
    })
    if (!response.ok) {
      throw new Error(response.error)
    }
  }
  revalidatePath(SETTINGS_PATH)
  redirect(`/compras?vista=pagos&orden_id=${encodeURIComponent(ordenId)}`)
}

export async function updateOrdenCompraPagoProgramadoAction(
  ordenId: string,
  pagoId: string,
  formData: FormData,
): Promise<void> {
  const responseOrder = await callCrmApi(`/crm/compras/ordenes/${ordenId}`, {
    method: "GET",
  })
  if (!responseOrder.ok) {
    throw new Error(responseOrder.error)
  }
  const order = responseOrder.data as Record<string, unknown> | null
  const fallbackCurrency = String(order?.moneda ?? "MXN").trim().toUpperCase() || "MXN"
  const payload = buildOrdenCompraPagoProgramadoPayload(formData, fallbackCurrency)
  const response = await callCrmApi(`/crm/compras/ordenes/${ordenId}/pagos-programados/${pagoId}`, {
    method: "PATCH",
    body: payload,
  })
  if (!response.ok) {
    throw new Error(response.error)
  }
  revalidatePath(SETTINGS_PATH)
  redirect(`/compras?vista=pagos&orden_id=${encodeURIComponent(ordenId)}`)
}

export async function deleteOrdenCompraPagoProgramadoAction(ordenId: string, pagoId: string): Promise<void> {
  const response = await callCrmApi(`/crm/compras/ordenes/${ordenId}/pagos-programados/${pagoId}`, {
    method: "DELETE",
  })
  if (!response.ok) {
    throw new Error(response.error)
  }
  revalidatePath(SETTINGS_PATH)
  redirect(`/compras?vista=pagos&orden_id=${encodeURIComponent(ordenId)}`)
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
