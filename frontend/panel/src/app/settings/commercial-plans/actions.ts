"use server"

import { revalidatePath } from "next/cache"

import { callCrmApi } from "@/lib/api/crm"

type CommercialPlanPayload = {
  code?: string
  name: string
  description?: string
  active?: boolean
  sort_order?: number
}

export type CommercialPlanActionState =
  | { ok: true; message: string }
  | { ok: false; error: string }

function success(message: string): CommercialPlanActionState {
  return { ok: true, message }
}

function failure(error: unknown, fallback: string): CommercialPlanActionState {
  const message =
    error instanceof Error
      ? error.message || fallback
      : typeof error === "string"
        ? error
        : fallback
  console.error("[settings/commercial-plans]", error)
  return { ok: false, error: message }
}

function getText(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

function getNumber(formData: FormData, key: string): number | undefined {
  const raw = getText(formData, key)
  if (!raw) return undefined
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

function getBoolean(formData: FormData, key: string): boolean {
  const value = formData.get(key)
  return value === "on" || value === "true" || value === "1"
}

function requirePlanId(formData: FormData): string {
  const planId = getText(formData, "plan_id")
  if (!planId) throw new Error("Falta plan_id.")
  return planId
}

function buildPayload(formData: FormData, includeCode = true): CommercialPlanPayload {
  const payload: CommercialPlanPayload = {
    name: getText(formData, "name"),
    description: getText(formData, "description") || undefined,
    active: getBoolean(formData, "active"),
    sort_order: getNumber(formData, "sort_order") ?? 0,
  }
  if (includeCode) {
    payload.code = getText(formData, "code")
  }
  return payload
}

export async function createCommercialPlanAction(
  _: CommercialPlanActionState,
  formData: FormData,
): Promise<CommercialPlanActionState> {
  try {
    const payload = buildPayload(formData, true)
    if (!payload.code) throw new Error("El código es obligatorio.")
    if (!payload.name) throw new Error("El nombre es obligatorio.")

    const response = await callCrmApi<{ ok: boolean; plan?: { id: string } }>("/admin/commercial-plans", {
      method: "POST",
      organizacionId: null,
      withUserToken: true,
      body: payload,
    })
    if (!response.ok) throw new Error(response.error)

    revalidatePath("/settings/commercial-plans")
    return success("Plan creado.")
  } catch (error) {
    return failure(error, "No se pudo crear el plan.")
  }
}

export async function updateCommercialPlanAction(
  _: CommercialPlanActionState,
  formData: FormData,
): Promise<CommercialPlanActionState> {
  try {
    const planId = requirePlanId(formData)
    const payload = buildPayload(formData, false)
    if (!payload.name) throw new Error("El nombre es obligatorio.")

    const response = await callCrmApi<{ ok: boolean }>(`/admin/commercial-plans/${planId}`, {
      method: "PATCH",
      organizacionId: null,
      withUserToken: true,
      body: payload,
    })
    if (!response.ok) throw new Error(response.error)

    revalidatePath("/settings/commercial-plans")
    return success("Plan actualizado.")
  } catch (error) {
    return failure(error, "No se pudo actualizar el plan.")
  }
}

export async function archiveCommercialPlanAction(
  formData: FormData,
): Promise<CommercialPlanActionState> {
  try {
    const planId = requirePlanId(formData)
    const response = await callCrmApi<{ ok: boolean }>(`/admin/commercial-plans/${planId}`, {
      method: "DELETE",
      organizacionId: null,
      withUserToken: true,
    })
    if (!response.ok) throw new Error(response.error)

    revalidatePath("/settings/commercial-plans")
    return success("Plan desactivado.")
  } catch (error) {
    return failure(error, "No se pudo desactivar el plan.")
  }
}
