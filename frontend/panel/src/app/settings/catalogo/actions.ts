"use server"

import { revalidatePath } from "next/cache"

import { getPanelApiBaseUrl } from "@/lib/api/panel"
import { resolvePanelApiToken } from "@/lib/auth/panel-token"

const SETTINGS_PATH = "/settings/catalogo"
const DEFAULT_MONEDA = "MXN"
const DEFAULT_UNIDAD = "unidad"
const DEFAULT_TIPO = "servicio"

export type CatalogItem = {
  id: string
  slug: string | null
  nombre: string
  tipo: "producto" | "servicio" | "paquete"
  descripcionCorta: string | null
  descripcionLarga: string | null
  unidad: string | null
  precioBase: number | null
  moneda: string
  impuestos: Record<string, unknown>[]
  activo: boolean
  requiereFactura: boolean
  claveSat: string | null
  unidadSat: string | null
  metadatos: Record<string, unknown>
  createdBy: string | null
  updatedBy: string | null
  creadoEn: string | null
  actualizadoEn: string | null
}

export type CatalogItemInput = {
  nombre: string
  slug?: string | null
  tipo?: "producto" | "servicio" | "paquete"
  descripcionCorta?: string | null
  descripcionLarga?: string | null
  unidad?: string | null
  precioBase?: number | null
  moneda?: string | null
  impuestos?: Record<string, unknown>[] | null
  activo?: boolean
  requiereFactura?: boolean
  claveSat?: string | null
  unidadSat?: string | null
  metadatos?: Record<string, unknown> | null
}

type FetchOptions = {
  includeInactive?: boolean
  search?: string | null
  tipo?: "producto" | "servicio" | "paquete" | null
  limit?: number
}

function normalizeString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length ? trimmed : null
  }
  return null
}

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
    createdBy: normalizeString(record.created_by ?? record.createdBy),
    updatedBy: normalizeString(record.updated_by ?? record.updatedBy),
    creadoEn: normalizeString(record.creado_en ?? record.creadoEn),
    actualizadoEn: normalizeString(record.actualizado_en ?? record.actualizadoEn),
  }
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

  return payload
}

async function authenticatedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await resolvePanelApiToken()
  const baseUrl = getPanelApiBaseUrl()
  const headers = new Headers(init.headers)
  headers.set("Accept", "application/json")
  headers.set("Authorization", `Bearer ${token}`)
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json")
  }
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  })
}

async function parseJson(response: Response): Promise<any> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function extractError(payload: any, fallback: string): string {
  if (payload && typeof payload === "object") {
    return (
      (typeof payload.error === "string" && payload.error) ||
      (typeof payload.detail === "string" && payload.detail) ||
      (typeof payload.message === "string" && payload.message) ||
      fallback
    )
  }
  if (typeof payload === "string" && payload.trim().length) {
    return payload
  }
  return fallback
}

export async function fetchCatalogItems(options?: FetchOptions): Promise<CatalogItem[]> {
  const params = new URLSearchParams({ limit: String(options?.limit ?? 500) })
  if (options?.includeInactive) params.set("include_inactive", "true")
  if (options?.tipo) params.set("tipo", options.tipo)
  if (options?.search) params.set("search", options.search)

  try {
    const response = await authenticatedFetch(`/catalog/items?${params.toString()}`)
    const payload = await parseJson(response)
    if (!response.ok) {
      throw new Error(extractError(payload, "No se pudo cargar el catálogo."))
    }
    const rows = Array.isArray(payload?.items) ? (payload.items as Record<string, unknown>[]) : []
    return rows.map((row) => normalizeCatalogItem(row))
  } catch (error) {
    console.warn("[catalog] fetchCatalogItems failed", error)
    return []
  }
}

export async function createCatalogItem(input: CatalogItemInput): Promise<CatalogItem> {
  if (!input.nombre?.trim()) {
    throw new Error("El nombre es obligatorio.")
  }
  const body = buildPayload(input)
  const response = await authenticatedFetch("/catalog/items", {
    method: "POST",
    body: JSON.stringify(body),
  })
  const payload = await parseJson(response)
  if (!response.ok) {
    throw new Error(extractError(payload, "No se pudo crear el producto."))
  }
  const item = payload?.item
  if (!item || typeof item !== "object") {
    throw new Error("La respuesta del servidor es inválida.")
  }
  revalidatePath(SETTINGS_PATH)
  return normalizeCatalogItem(item as Record<string, unknown>)
}

export async function updateCatalogItem(id: string, input: CatalogItemInput): Promise<CatalogItem> {
  if (!id) {
    throw new Error("Falta el identificador del producto.")
  }
  if (!input.nombre?.trim()) {
    throw new Error("El nombre es obligatorio.")
  }
  const body = buildPayload(input)
  const response = await authenticatedFetch(`/catalog/items/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  })
  const payload = await parseJson(response)
  if (!response.ok) {
    throw new Error(extractError(payload, "No se pudo actualizar el producto."))
  }
  const item = payload?.item
  if (!item || typeof item !== "object") {
    throw new Error("La respuesta del servidor es inválida.")
  }
  revalidatePath(SETTINGS_PATH)
  return normalizeCatalogItem(item as Record<string, unknown>)
}

export async function deleteCatalogItem(
  id: string,
  options?: { hard?: boolean },
): Promise<CatalogItem | null> {
  if (!id) {
    throw new Error("Falta el identificador del producto.")
  }
  const hard = options?.hard ? "true" : "false"
  const response = await authenticatedFetch(`/catalog/items/${id}?hard=${hard}`, {
    method: "DELETE",
  })
  const payload = await parseJson(response)
  if (!response.ok) {
    throw new Error(extractError(payload, "No se pudo eliminar el producto."))
  }
  const item = payload?.item
  revalidatePath(SETTINGS_PATH)
  if (!item || typeof item !== "object") {
    return null
  }
  return normalizeCatalogItem(item as Record<string, unknown>)
}
