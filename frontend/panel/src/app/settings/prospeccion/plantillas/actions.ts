"use server"

import { revalidatePath } from "next/cache"

import { callCrmApi } from "@/lib/api/crm"

const SETTINGS_PATH = "/settings/prospeccion/plantillas"

export type ContactTemplate = {
  id: string
  canal: "correo" | "whatsapp" | "llamada"
  nombre: string
  slug: string
  descripcion?: string | null
  asunto?: string | null
  cuerpoTexto?: string | null
  cuerpoHtml?: string | null
  metadata: Record<string, unknown>
  activo: boolean
  creadoEn?: string | null
  actualizadoEn?: string | null
}

export type ContactTemplateInput = {
  canal?: "correo" | "whatsapp" | "llamada"
  nombre?: string
  slug?: string | null
  descripcion?: string | null
  asunto?: string | null
  cuerpo_texto?: string | null
  cuerpo_html?: string | null
  metadata?: Record<string, unknown> | null
  activo?: boolean
}

type CrmContactTemplate = {
  id: string
  canal: string
  nombre: string
  slug: string
  descripcion: string | null
  asunto: string | null
  cuerpo_texto: string | null
  cuerpo_html: string | null
  metadata: Record<string, unknown> | null
  activo: boolean
  creado_en: string | null
  actualizado_en: string | null
}

function normalizeTemplate(record: CrmContactTemplate): ContactTemplate {
  return {
    id: String(record.id),
    canal: record.canal as ContactTemplate["canal"],
    nombre: record.nombre?.trim() || "Sin nombre",
    slug: record.slug?.trim() || record.id,
    descripcion: record.descripcion,
    asunto: record.asunto,
    cuerpoTexto: record.cuerpo_texto,
    cuerpoHtml: record.cuerpo_html,
    metadata: record.metadata && typeof record.metadata === "object" ? record.metadata : {},
    activo: Boolean(record.activo),
    creadoEn: record.creado_en,
    actualizadoEn: record.actualizado_en,
  }
}

function toPayload(input: ContactTemplateInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  if (input.canal) payload.canal = input.canal
  if (input.nombre !== undefined) payload.nombre = input.nombre?.trim()
  if (input.slug !== undefined) payload.slug = input.slug?.trim()
  if (input.descripcion !== undefined) payload.descripcion = input.descripcion?.trim() || null
  if (input.asunto !== undefined) payload.asunto = input.asunto?.trim() || null
  if (input.cuerpo_texto !== undefined) payload.cuerpo_texto = input.cuerpo_texto?.trim() || null
  if (input.cuerpo_html !== undefined) payload.cuerpo_html = input.cuerpo_html?.trim() || null
  if (input.metadata !== undefined) payload.metadata = input.metadata ?? {}
  if (typeof input.activo === "boolean") payload.activo = input.activo
  return payload
}

export async function fetchContactTemplates(): Promise<ContactTemplate[]> {
  const response = await callCrmApi<{ ok: boolean; items: CrmContactTemplate[] }>(
    "/crm/prospeccion/contacto/templates",
  )

  if (!response.ok || !response.data?.ok) {
    console.warn("[settings] fetch contact templates failed:", response)
    return []
  }

  const items = Array.isArray(response.data.items) ? response.data.items : []
  return items.map(normalizeTemplate)
}

export async function createContactTemplate(input: ContactTemplateInput): Promise<ContactTemplate> {
  const response = await callCrmApi<{ ok: boolean; template: CrmContactTemplate }>(
    "/crm/prospeccion/contacto/templates",
    {
      method: "POST",
      body: toPayload(input),
    },
  )

  if (!response.ok || !response.data?.template) {
    const message = !response.ok ? response.error : "No se pudo crear la plantilla."
    throw new Error(message || "No se pudo crear la plantilla.")
  }

  await revalidatePath(SETTINGS_PATH)
  return normalizeTemplate(response.data.template)
}

export async function updateContactTemplate(
  templateId: string,
  input: ContactTemplateInput,
): Promise<ContactTemplate> {
  const response = await callCrmApi<{ ok: boolean; template: CrmContactTemplate }>(
    `/crm/prospeccion/contacto/templates/${templateId}`,
    {
      method: "PATCH",
      body: toPayload(input),
    },
  )

  if (!response.ok || !response.data?.template) {
    const message = !response.ok ? response.error : "No se pudo actualizar la plantilla."
    throw new Error(message || "No se pudo actualizar la plantilla.")
  }

  await revalidatePath(SETTINGS_PATH)
  return normalizeTemplate(response.data.template)
}

export async function deleteContactTemplate(templateId: string): Promise<void> {
  const response = await callCrmApi(`/crm/prospeccion/contacto/templates/${templateId}`, {
    method: "DELETE",
  })

  if (!response.ok) {
    throw new Error(response.error || "No se pudo eliminar la plantilla.")
  }

  await revalidatePath(SETTINGS_PATH)
}
