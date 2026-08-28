"use server";

import { revalidatePath } from "next/cache";

import { callCrmApi } from "@/lib/api/crm";

const SETTINGS_PATH = "/settings/productos/items";
const DEFAULT_MONEDA = "MXN";
const DEFAULT_UNIDAD = "unidad";
const DEFAULT_TIPO = "servicio";

export type CatalogItem = {
  id: string;
  codigo: string | null;
  slug: string | null;
  nombre: string;
  tipo: "producto" | "servicio" | "paquete";
  descripcionCorta: string | null;
  descripcionLarga: string | null;
  unidad: string | null;
  precioBase: number | null;
  moneda: string;
  impuestos: Record<string, unknown>[];
  activo: boolean;
  requiereFactura: boolean;
  claveSat: string | null;
  unidadSat: string | null;
  metadatos: Record<string, unknown>;
  manejaInventario: boolean;
  stockMinimo: number | null;
  stockObjetivo: number | null;
  costoUltimo: number | null;
  costoPromedio: number | null;
  requiereLote: boolean;
  requiereSerie: boolean;
  proveedorPrincipalId: string | null;
  activoCompra: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  creadoEn: string | null;
  actualizadoEn: string | null;
  lineaId: string | null;
  familiaId: string | null;
  modeloId: string | null;
  lineaNombre: string | null;
  familiaNombre: string | null;
  modeloNombre: string | null;
  fotoUrl: string | null;
};

export type CatalogItemInput = {
  codigo?: string | null;
  nombre: string;
  slug?: string | null;
  tipo?: "producto" | "servicio" | "paquete";
  descripcionCorta?: string | null;
  descripcionLarga?: string | null;
  unidad?: string | null;
  precioBase?: number | null;
  moneda?: string | null;
  impuestos?: Record<string, unknown>[] | null;
  activo?: boolean;
  requiereFactura?: boolean;
  claveSat?: string | null;
  unidadSat?: string | null;
  metadatos?: Record<string, unknown> | null;
  manejaInventario?: boolean;
  stockMinimo?: number | null;
  stockObjetivo?: number | null;
  costoUltimo?: number | null;
  costoPromedio?: number | null;
  requiereLote?: boolean;
  requiereSerie?: boolean;
  proveedorPrincipalId?: string | null;
  activoCompra?: boolean;
  lineaId?: string | null;
  familiaId?: string | null;
  modeloId?: string | null;
};

type FetchOptions = {
  includeInactive?: boolean;
  search?: string | null;
  tipo?: "producto" | "servicio" | "paquete" | null;
  limit?: number;
};

type CrmCatalogItem = {
  id: string;
  slug: string | null;
  nombre: string;
  tipo: string;
  descripcion_corta: string | null;
  descripcion_larga: string | null;
  unidad: string;
  precio_base: number | null;
  moneda: string;
  impuestos: Record<string, unknown>[] | null;
  activo: boolean;
  requiere_factura: boolean;
  clave_sat: string | null;
  unidad_sat: string | null;
  metadatos: Record<string, unknown> | null;
  created_by: string | null;
  updated_by: string | null;
  creado_en: string | null;
  actualizado_en: string | null;
  linea_id: string | null;
  familia_id: string | null;
  modelo_id: string | null;
  linea: { id: string; nombre: string } | null;
  familia: { id: string; nombre: string } | null;
  modelo: { id: string; nombre: string } | null;
};

type CrmCatalogDeleteResponse = {
  item: CrmCatalogItem | null;
  hard_deleted: boolean;
};

function normalizeString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
  }
  return null
}

export type CatalogPriceList = {
  id: string
  nombre: string
  activo: boolean
  moneda: string
}

export type CatalogItemPriceListValue = {
  listaPrecioId: string
  precio: number
  moneda: string
}

export type CatalogItemPriceListBatch = Record<string, Record<string, CatalogItemPriceListValue>>

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value
  }
  if (typeof value === "string") {
    if (["true", "1", "t", "yes", "si"].includes(value.toLowerCase())) {
      return true
    }
    if (["false", "0", "f", "no"].includes(value.toLowerCase())) {
      return false
    }
  }
  return fallback
}

function normalizeJsonArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter((entry) => entry && typeof entry === "object") as Record<string, unknown>[]
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) {
        return parsed.filter((entry) => entry && typeof entry === "object") as Record<string, unknown>[]
      }
    } catch {
      return []
    }
  }
  return []
}

function normalizeCurrency(value: unknown): string {
  if (typeof value === "string" && value.trim().length === 3) {
    return value.trim().toUpperCase()
  }
  return DEFAULT_MONEDA
}

function normalizeTipo(value: unknown): "producto" | "servicio" | "paquete" {
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase()
    if (lowered === "producto" || lowered === "servicio" || lowered === "paquete") {
      return lowered
    }
  }
  return DEFAULT_TIPO
}

function normalizeCatalogItem(record: Record<string, unknown>): CatalogItem {
  return {
    id: String(record.id ?? ""),
    codigo: normalizeString(record.codigo),
    slug: normalizeString(record.slug),
    nombre: normalizeString(record.nombre) ?? "Sin nombre",
    tipo: normalizeTipo(record.tipo),
    descripcionCorta: normalizeString(record.descripcion_corta ?? record.descripcionCorta),
    descripcionLarga: normalizeString(record.descripcion_larga ?? record.descripcionLarga),
    unidad: normalizeString(record.unidad) ?? DEFAULT_UNIDAD,
    precioBase: normalizeNumber(record.precio_base ?? record.precioBase),
    moneda: normalizeCurrency(record.moneda),
    impuestos: normalizeJsonArray(record.impuestos),
    activo: normalizeBoolean(record.activo, true),
    requiereFactura: normalizeBoolean(record.requiere_factura ?? record.requiereFactura, false),
    claveSat: normalizeString(record.clave_sat ?? record.claveSat),
    unidadSat: normalizeString(record.unidad_sat ?? record.unidadSat),
    metadatos:
      (record.metadatos && typeof record.metadatos === "object"
        ? (record.metadatos as Record<string, unknown>)
        : {}),
    manejaInventario: normalizeBoolean(record.maneja_inventario ?? record.manejaInventario, false),
    stockMinimo: normalizeNumber(record.stock_minimo ?? record.stockMinimo),
    stockObjetivo: normalizeNumber(record.stock_objetivo ?? record.stockObjetivo),
    costoUltimo: normalizeNumber(record.costo_ultimo ?? record.costoUltimo),
    costoPromedio: normalizeNumber(record.costo_promedio ?? record.costoPromedio),
    requiereLote: normalizeBoolean(record.requiere_lote ?? record.requiereLote, false),
    requiereSerie: normalizeBoolean(record.requiere_serie ?? record.requiereSerie, false),
    proveedorPrincipalId: normalizeString(record.proveedor_principal_id ?? record.proveedorPrincipalId),
    activoCompra: normalizeBoolean(record.activo_compra ?? record.activoCompra, true),
    createdBy: normalizeString(record.created_by ?? record.createdBy),
    updatedBy: normalizeString(record.updated_by ?? record.updatedBy),
    creadoEn: normalizeString(record.creado_en ?? record.creadoEn),
    actualizadoEn: normalizeString(record.actualizado_en ?? record.actualizadoEn),
    lineaId: normalizeString(record.linea_id ?? record.lineaId),
    familiaId: normalizeString(record.familia_id ?? record.familiaId),
    modeloId: normalizeString(record.modelo_id ?? record.modeloId),
    lineaNombre: normalizeString(
      (record.linea && typeof record.linea === "object" ? (record.linea as Record<string, unknown>).nombre : null) ??
        record.lineaNombre,
    ),
    familiaNombre: normalizeString(
      (record.familia && typeof record.familia === "object"
        ? (record.familia as Record<string, unknown>).nombre
        : null) ?? record.familiaNombre,
    ),
    modeloNombre: normalizeString(
      (record.modelo && typeof record.modelo === "object"
        ? (record.modelo as Record<string, unknown>).nombre
        : null) ?? record.modeloNombre,
    ),
    fotoUrl: extractMediaUrl(record.metadatos ?? record.metadatos),
  }
}

function extractMediaUrl(metadatos: unknown): string | null {
  if (!metadatos || typeof metadatos !== "object") {
    return null
  }
  const media = (metadatos as Record<string, unknown>).media
  if (!Array.isArray(media)) {
    return null
  }
  const sorted = [...media].sort((a, b) => {
    const pa = typeof a === "object" && a && "predeterminada" in a ? (a as Record<string, unknown>).predeterminada : false
    const pb = typeof b === "object" && b && "predeterminada" in b ? (b as Record<string, unknown>).predeterminada : false
    return (pb === pa ? 0 : pb ? 1 : -1)
  })
  for (const entry of sorted) {
    if (entry && typeof entry === "object") {
      const url = (entry as Record<string, unknown>).url
      if (typeof url === "string" && url.trim()) {
        return url.trim()
      }
    }
  }
  return null
}

function sanitizeText(value: string | null | undefined): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
  }
  return null
}

function buildPayload(input: CatalogItemInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    nombre: input.nombre.trim(),
  }

  if (input.codigo !== undefined) payload.codigo = sanitizeText(input.codigo)
  if (input.slug !== undefined) payload.slug = sanitizeText(input.slug)
  if (input.tipo) payload.tipo = input.tipo
  if (input.descripcionCorta !== undefined) payload.descripcion_corta = sanitizeText(input.descripcionCorta)
  if (input.descripcionLarga !== undefined) payload.descripcion_larga = sanitizeText(input.descripcionLarga)
  if (input.unidad !== undefined) payload.unidad = sanitizeText(input.unidad) ?? DEFAULT_UNIDAD
  if (input.precioBase !== undefined) payload.precio_base = input.precioBase ?? null
  if (input.moneda !== undefined)
    payload.moneda = input.moneda ? input.moneda.trim().toUpperCase() : DEFAULT_MONEDA
  if (input.impuestos !== undefined) payload.impuestos = input.impuestos ?? []
  if (input.activo !== undefined) payload.activo = Boolean(input.activo)
  if (input.requiereFactura !== undefined) payload.requiere_factura = Boolean(input.requiereFactura)
  if (input.claveSat !== undefined) payload.clave_sat = sanitizeText(input.claveSat)
  if (input.unidadSat !== undefined) payload.unidad_sat = sanitizeText(input.unidadSat)
  if (input.metadatos !== undefined) payload.metadatos = input.metadatos ?? {}
  if (input.manejaInventario !== undefined) payload.maneja_inventario = Boolean(input.manejaInventario)
  const unidad = sanitizeText(input.unidad) ?? DEFAULT_UNIDAD
  payload.unidad = unidad
  payload.unidad_inventario = unidad
  if (input.stockMinimo !== undefined) payload.stock_minimo = input.stockMinimo ?? null
  if (input.stockObjetivo !== undefined) payload.stock_objetivo = input.stockObjetivo ?? null
  if (input.costoUltimo !== undefined) payload.costo_ultimo = input.costoUltimo ?? null
  if (input.costoPromedio !== undefined) payload.costo_promedio = input.costoPromedio ?? null
  if (input.requiereLote !== undefined) payload.requiere_lote = Boolean(input.requiereLote)
  if (input.requiereSerie !== undefined) payload.requiere_serie = Boolean(input.requiereSerie)
  if (input.proveedorPrincipalId !== undefined) payload.proveedor_principal_id = input.proveedorPrincipalId ?? null
  if (input.activoCompra !== undefined) payload.activo_compra = Boolean(input.activoCompra)
  if (input.lineaId !== undefined) payload.linea_id = input.lineaId ?? null
  if (input.familiaId !== undefined) payload.familia_id = input.familiaId ?? null
  if (input.modeloId !== undefined) payload.modelo_id = input.modeloId ?? null

  return payload
}

export async function fetchCatalogItems(options?: FetchOptions): Promise<CatalogItem[]> {
  const response = await callCrmApi<CrmCatalogItem[]>("/crm/catalog/items", {
    searchParams: {
      limit: String(options?.limit ?? 500),
      include_inactive: options?.includeInactive ? "true" : undefined,
      tipo: options?.tipo ?? undefined,
      search: options?.search ?? undefined,
    },
  });

  if (!response.ok) {
    console.warn("[catalog] fetchCatalogItems failed", response.error);
    return [];
  }
  if (!Array.isArray(response.data)) {
    console.warn("[catalog] fetchCatalogItems failed: respuesta vacía");
    return [];
  }

  return response.data.map((row) => normalizeCatalogItem(row));
}

export async function fetchCatalogPriceLists(): Promise<CatalogPriceList[]> {
  const response = await callCrmApi<Record<string, unknown>[]>("/crm/catalog/price-lists", {
    searchParams: { include_inactive: "false" },
  })
  if (!response.ok || !Array.isArray(response.data)) return []
  return response.data
    .map((row) => ({
      id: String(row.id ?? ""),
      nombre: String(row.nombre ?? "").trim(),
      activo: row.activo !== false,
      moneda: String(row.moneda ?? DEFAULT_MONEDA).toUpperCase(),
    }))
    .filter((row) => row.id && row.nombre && row.activo)
}

export async function fetchCatalogItemPriceLists(itemId: string): Promise<CatalogItemPriceListValue[]> {
  const response = await callCrmApi<Record<string, unknown>[]>(`/crm/catalog/items/${itemId}/price-lists`, {})
  if (!response.ok || !Array.isArray(response.data)) return []
  return response.data.flatMap((row) => {
    const listaPrecioId = String(row.lista_precio_id ?? "")
    const precio = Number(row.precio)
    if (!listaPrecioId || !Number.isFinite(precio)) return []
    return [{ listaPrecioId, precio, moneda: String(row.moneda ?? DEFAULT_MONEDA).toUpperCase() }]
  })
}

export async function fetchCatalogItemPriceListsBatch(itemIds: string[]): Promise<CatalogItemPriceListBatch> {
  const normalizedIds = [...new Set(itemIds.map((itemId) => itemId.trim()).filter(Boolean))]
  if (!normalizedIds.length) return {}
  const response = await callCrmApi<Record<string, unknown>[]>("/crm/catalog/items/price-lists", {
    searchParams: { item_ids: normalizedIds.join(",") },
  })
  if (!response.ok || !Array.isArray(response.data)) return {}
  return response.data.reduce<CatalogItemPriceListBatch>((result, row) => {
    const itemId = String(row.catalog_item_id ?? "")
    const listaPrecioId = String(row.lista_precio_id ?? "")
    const precio = Number(row.precio)
    if (!itemId || !listaPrecioId || !Number.isFinite(precio)) return result
    result[itemId] ??= {}
    result[itemId][listaPrecioId] = {
      listaPrecioId,
      precio,
      moneda: String(row.moneda ?? DEFAULT_MONEDA).toUpperCase(),
    }
    return result
  }, {})
}

export async function saveCatalogItemPriceLists(
  itemId: string,
  values: CatalogItemPriceListValue[],
): Promise<CatalogItemPriceListValue[]> {
  const response = await callCrmApi<Record<string, unknown>[]>(`/crm/catalog/items/${itemId}/price-lists`, {
    method: "PUT",
    body: {
      values: values.map((value) => ({
        lista_precio_id: value.listaPrecioId,
        precio: value.precio,
        moneda: value.moneda,
        activo: true,
      })),
    },
  })
  if (!response.ok || !Array.isArray(response.data)) {
    throw new Error(response.ok ? "No se pudo guardar los precios por lista." : response.error || "No se pudo guardar los precios por lista.")
  }
  return response.data.flatMap((row) => {
    const listaPrecioId = String(row.lista_precio_id ?? "")
    const precio = Number(row.precio)
    if (!listaPrecioId || !Number.isFinite(precio)) return []
    return [{ listaPrecioId, precio, moneda: String(row.moneda ?? DEFAULT_MONEDA).toUpperCase() }]
  })
}

export async function updateCatalogItemPriceListCell(
  itemId: string,
  listaPrecioId: string,
  precio: number,
  moneda: string,
): Promise<CatalogItemPriceListValue> {
  const response = await callCrmApi<Record<string, unknown>>(
    `/crm/catalog/items/${itemId}/price-lists/${listaPrecioId}`,
    { method: "PATCH", body: { precio, moneda } },
  )
  if (!response.ok) {
    throw new Error(response.error || "No se pudo actualizar el precio.")
  }
  if (!response.data) {
    throw new Error("No se pudo actualizar el precio.")
  }
  return {
    listaPrecioId,
    precio: Number(response.data.precio),
    moneda: String(response.data.moneda ?? moneda).toUpperCase(),
  }
}

export async function createCatalogItem(input: CatalogItemInput): Promise<CatalogItem> {
  if (!input.nombre?.trim()) {
    throw new Error("El nombre es obligatorio.");
  }
  const body = buildPayload(input);
  const response = await callCrmApi<CrmCatalogItem>("/crm/catalog/items", {
    method: "POST",
    body,
  });
  if (!response.ok) {
    throw new Error(response.error || "No se pudo crear el producto.");
  }
  if (!response.data) {
    throw new Error("No se pudo crear el producto.");
  }
  revalidatePath(SETTINGS_PATH);
  return normalizeCatalogItem(response.data);
}

export async function updateCatalogItem(id: string, input: CatalogItemInput): Promise<CatalogItem> {
  if (!id) {
    throw new Error("Falta el identificador del producto.");
  }
  if (!input.nombre?.trim()) {
    throw new Error("El nombre es obligatorio.");
  }
  const body = buildPayload(input);
  const response = await callCrmApi<CrmCatalogItem>(`/crm/catalog/items/${id}`, {
    method: "PATCH",
    body,
  });
  if (!response.ok) {
    throw new Error(response.error || "No se pudo actualizar el producto.");
  }
  if (!response.data) {
    throw new Error("No se pudo actualizar el producto.");
  }
  revalidatePath(SETTINGS_PATH);
  return normalizeCatalogItem(response.data);
}

export async function deleteCatalogItem(
  id: string,
  options?: { hard?: boolean },
): Promise<CatalogItem | null> {
  if (!id) {
    throw new Error("Falta el identificador del producto.");
  }
  const response = await callCrmApi<CrmCatalogDeleteResponse>(`/crm/catalog/items/${id}`, {
    method: "DELETE",
    searchParams: {
      hard: options?.hard ? "true" : "false",
    },
  });
  if (!response.ok) {
    throw new Error(response.error || "No se pudo eliminar el producto.");
  }
  if (!response.data) {
    throw new Error("No se pudo eliminar el producto.");
  }
  revalidatePath(SETTINGS_PATH);
  if (!response.data.item) {
    return null;
  }
  return normalizeCatalogItem(response.data.item);
}
