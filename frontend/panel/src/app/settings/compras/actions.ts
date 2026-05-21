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

function parseItemsJson(value: FormDataEntryValue | null): Record<string, unknown>[] {
  const raw = parseOptionalText(value)
  if (!raw) {
    throw new Error("items_required")
  }
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.length) {
      throw new Error("items_required")
    }
    return parsed.filter((entry) => entry && typeof entry === "object") as Record<string, unknown>[]
  } catch {
    throw new Error("items_json_invalid")
  }
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

export async function createRecepcionAction(formData: FormData): Promise<void> {
  const items = parseItemsJson(formData.get("items_json"))
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
