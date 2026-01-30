"use server"

import { revalidatePath } from "next/cache"

import { callCrmApi } from "@/lib/api/crm"

export type CrudActionState = {
  status: "idle" | "success" | "error"
  message?: string
}

export type CrudActionHandler = (prevState: CrudActionState, formData: FormData) => Promise<CrudActionState>

function success(message: string): CrudActionState {
  return { status: "success", message }
}

function failure(error: unknown, fallback: string): CrudActionState {
  const message =
    error instanceof Error
      ? error.message || fallback
      : typeof error === "string"
        ? error
        : fallback
  console.error("[settings/tenants]", error)
  return { status: "error", message }
}

function getText(formData: FormData, key: string): string {
  const value = formData.get(key)
  if (typeof value !== "string") return ""
  return value.trim()
}

function requireTenantId(formData: FormData): string {
  const tenantId = getText(formData, "tenant_id")
  if (!tenantId) throw new Error("Falta tenant_id.")
  return tenantId
}

export async function updateTenantConfigAction(_: CrudActionState, formData: FormData): Promise<CrudActionState> {
  try {
    const tenantId = requireTenantId(formData)
    const configRaw = getText(formData, "config_json")
    if (!configRaw) throw new Error("El JSON de config es obligatorio.")

    let config: unknown
    try {
      config = JSON.parse(configRaw)
    } catch {
      throw new Error("JSON inválido: revisa comillas y llaves.")
    }
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw new Error("La config debe ser un objeto JSON (no array).")
    }

    const response = await callCrmApi<{ ok: boolean }>(`/admin/tenants/${tenantId}/config`, {
      method: "PUT",
      organizacionId: null,
      withUserToken: true,
      body: { config },
    })
    if (!response.ok) throw new Error(response.error)

    revalidatePath(`/settings/tenants/${tenantId}`)
    return success("Config guardada.")
  } catch (error) {
    return failure(error, "No se pudo guardar la config.")
  }
}

export async function setTenantSecretAction(_: CrudActionState, formData: FormData): Promise<CrudActionState> {
  try {
    const tenantId = requireTenantId(formData)
    const clave = getText(formData, "clave")
    const valor = getText(formData, "valor")
    const tier = (getText(formData, "tier") || "A") as "A" | "B"
    const etiqueta = getText(formData, "etiqueta")

    if (!clave) throw new Error("La clave es obligatoria.")
    if (!valor) throw new Error("El valor es obligatorio.")

    const response = await callCrmApi<{ ok: boolean }>(
      `/admin/tenants/${tenantId}/secrets/${encodeURIComponent(clave)}`,
      {
        method: "PUT",
        organizacionId: null,
        withUserToken: true,
        body: { valor, tier, etiqueta: etiqueta || undefined },
      },
    )
    if (!response.ok) throw new Error(response.error)

    revalidatePath(`/settings/tenants/${tenantId}`)
    return success("Secreto guardado (rotado).")
  } catch (error) {
    return failure(error, "No se pudo guardar el secreto.")
  }
}

export async function deleteTenantSecretAction(_: CrudActionState, formData: FormData): Promise<CrudActionState> {
  try {
    const tenantId = requireTenantId(formData)
    const clave = getText(formData, "clave")
    if (!clave) throw new Error("Falta clave.")

    const response = await callCrmApi<{ ok: boolean }>(
      `/admin/tenants/${tenantId}/secrets/${encodeURIComponent(clave)}`,
      {
        method: "DELETE",
        organizacionId: null,
        withUserToken: true,
      },
    )
    if (!response.ok) throw new Error(response.error)

    revalidatePath(`/settings/tenants/${tenantId}`)
    return success("Secreto eliminado.")
  } catch (error) {
    return failure(error, "No se pudo eliminar el secreto.")
  }
}

export async function createTenantRouteAction(_: CrudActionState, formData: FormData): Promise<CrudActionState> {
  try {
    const tenantId = requireTenantId(formData)
    const canal = getText(formData, "canal")
    const clave = getText(formData, "clave")

    if (!canal) throw new Error("El canal es obligatorio.")
    if (!clave) throw new Error("La clave es obligatoria.")

    const response = await callCrmApi<{ ok: boolean }>(`/admin/tenants/${tenantId}/routes`, {
      method: "POST",
      organizacionId: null,
      withUserToken: true,
      body: { canal, clave },
    })
    if (!response.ok) throw new Error(response.error)

    revalidatePath(`/settings/tenants/${tenantId}`)
    return success("Ruta creada.")
  } catch (error) {
    return failure(error, "No se pudo crear la ruta.")
  }
}

export async function deleteTenantRouteAction(_: CrudActionState, formData: FormData): Promise<CrudActionState> {
  try {
    const tenantId = requireTenantId(formData)
    const routeId = getText(formData, "route_id")
    if (!routeId) throw new Error("Falta route_id.")

    const response = await callCrmApi<{ ok: boolean }>(`/admin/tenants/${tenantId}/routes/${routeId}`, {
      method: "DELETE",
      organizacionId: null,
      withUserToken: true,
    })
    if (!response.ok) throw new Error(response.error)

    revalidatePath(`/settings/tenants/${tenantId}`)
    return success("Ruta eliminada.")
  } catch (error) {
    return failure(error, "No se pudo eliminar la ruta.")
  }
}
