"use server"

import { revalidatePath } from "next/cache"

import { callCrmApi } from "@/lib/api/crm"

export type CrudActionState = {
  status: "idle" | "success" | "error"
  message?: string
  report?: {
    missing_routes: string[]
    missing_secrets: string[]
    missing_config: string[]
    notes: string[]
  }
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

function getOptionalBoolean(formData: FormData, key: string): boolean | null {
  if (!formData.has(key)) return null
  const value = formData.get(key)
  if (typeof value !== "string") return null
  const normalized = value.trim().toLowerCase()
  if (!normalized.length) return null
  return normalized === "on" || normalized === "true" || normalized === "1" || normalized === "sí"
}

function requireTenantId(formData: FormData): string {
  const tenantId = getText(formData, "tenant_id")
  if (!tenantId) throw new Error("Falta tenant_id.")
  return tenantId
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function mergeDeep(target: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  for (const [key, value] of Object.entries(patch)) {
    const current = target[key]
    if (isRecord(value) && isRecord(current)) {
      target[key] = mergeDeep({ ...current }, value)
    } else {
      target[key] = value
    }
  }
  return target
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

export async function updateWebchatSettingsAction(_: CrudActionState, formData: FormData): Promise<CrudActionState> {
  try {
    const tenantId = requireTenantId(formData)

    const webchatEnabled = getOptionalBoolean(formData, "webchat_enabled")
    const assistantId = getText(formData, "webchat_assistant_id")
    const promptVersion = getText(formData, "webchat_prompt_version")
    const inactivityHoursRaw = getText(formData, "webchat_inactivity_hours")
    const persistSession = getOptionalBoolean(formData, "webchat_persist_session")
    const reengageMinutesRaw = getText(formData, "webchat_reengage_minutes")
    const reengageMaxAttemptsRaw = getText(formData, "webchat_reengage_max_attempts")
    const escalateMinutesRaw = getText(formData, "webchat_escalate_minutes")
    const calendarResourceId = getText(formData, "webchat_calendar_resource_id")
    const calendarTimezone = getText(formData, "webchat_calendar_timezone")
    const calendarDefaultDaysRaw = getText(formData, "webchat_calendar_default_days")
    const calendarHoldMinutesRaw = getText(formData, "webchat_calendar_hold_minutes")

    const openaiApiKey = getText(formData, "openai_api_key")
    const webchatAlias = getText(formData, "webchat_alias")

    const getResp = await callCrmApi<{ ok: boolean; config: Record<string, unknown> }>(`/admin/tenants/${tenantId}/config`, {
      method: "GET",
      organizacionId: null,
      withUserToken: true,
    })
    if (!getResp.ok) throw new Error(getResp.error)

    const currentConfig = getResp.data.config ?? {}
    const patch: Record<string, unknown> = {}

    if (webchatEnabled !== null) {
      patch.features = { webchat: { enabled: webchatEnabled } }
    }

    const parseNumber = (raw: string): number | undefined => {
      if (!raw) return undefined
      const num = Number(raw)
      return Number.isFinite(num) ? num : undefined
    }

    const webchatPatch: Record<string, unknown> = {}
    if (assistantId) webchatPatch.assistant_id = assistantId
    if (promptVersion) webchatPatch.prompt_version = promptVersion
    const inactivityHours = parseNumber(inactivityHoursRaw)
    if (inactivityHours !== undefined) webchatPatch.inactivity_hours = inactivityHours
    if (persistSession !== null) webchatPatch.persist_session = persistSession
    const reengageMinutes = parseNumber(reengageMinutesRaw)
    if (reengageMinutes !== undefined) webchatPatch.reengage_minutes = reengageMinutes
    const reengageMaxAttempts = parseNumber(reengageMaxAttemptsRaw)
    if (reengageMaxAttempts !== undefined) webchatPatch.reengage_max_attempts = reengageMaxAttempts
    const escalateMinutes = parseNumber(escalateMinutesRaw)
    if (escalateMinutes !== undefined) webchatPatch.escalate_minutes = escalateMinutes

    const calendarPatch: Record<string, unknown> = {}
    if (calendarResourceId) calendarPatch.resource_id = calendarResourceId
    if (calendarTimezone) calendarPatch.timezone = calendarTimezone
    const calendarDefaultDays = parseNumber(calendarDefaultDaysRaw)
    if (calendarDefaultDays !== undefined) calendarPatch.default_days = calendarDefaultDays
    const calendarHoldMinutes = parseNumber(calendarHoldMinutesRaw)
    if (calendarHoldMinutes !== undefined) calendarPatch.hold_minutes = calendarHoldMinutes
    if (Object.keys(calendarPatch).length) webchatPatch.calendar = calendarPatch

    if (Object.keys(webchatPatch).length) {
      patch.webchat = webchatPatch
    }

    const merged = mergeDeep({ ...currentConfig }, patch)

    const putResp = await callCrmApi<{ ok: boolean }>(`/admin/tenants/${tenantId}/config`, {
      method: "PUT",
      organizacionId: null,
      withUserToken: true,
      body: { config: merged },
    })
    if (!putResp.ok) throw new Error(putResp.error)

    if (webchatAlias) {
      const routeResp = await callCrmApi<{ ok: boolean }>(`/admin/tenants/${tenantId}/routes`, {
        method: "POST",
        organizacionId: null,
        withUserToken: true,
        body: { canal: "webchat", clave: webchatAlias },
      })
      if (!routeResp.ok && routeResp.status !== 409) {
        // No bloqueamos todo el guardado si la ruta ya existe o choca; solo avisamos.
        console.warn("[settings/tenants] webchat route warning", routeResp.error)
      }
    }

    if (openaiApiKey) {
      const secretResp = await callCrmApi<{ ok: boolean }>(`/admin/tenants/${tenantId}/secrets/openai.api_key`, {
        method: "PUT",
        organizacionId: null,
        withUserToken: true,
        body: { valor: openaiApiKey, tier: "B" },
      })
      if (!secretResp.ok) throw new Error(secretResp.error)
    }

    revalidatePath(`/settings/tenants/${tenantId}`)
    return success("Webchat guardado (config/routing/secretos).")
  } catch (error) {
    return failure(error, "No se pudo guardar la configuración de Webchat.")
  }
}

export async function validateTenantAction(_: CrudActionState, formData: FormData): Promise<CrudActionState> {
  try {
    const tenantId = requireTenantId(formData)
    const scope = getText(formData, "scope") || "full"
    const resp = await callCrmApi<{
      ok: boolean
      missing_routes: string[]
      missing_secrets: string[]
      missing_config: string[]
      notes: string[]
    }>(`/admin/tenants/${tenantId}/validate`, {
      method: "POST",
      organizacionId: null,
      withUserToken: true,
      searchParams: { scope },
    })
    if (!resp.ok) throw new Error(resp.error)
    const report = resp.data
    const totalMissing = report.missing_routes.length + report.missing_secrets.length + report.missing_config.length
    return { status: "success", message: totalMissing ? `Faltantes detectados: ${totalMissing}` : "Tenant OK (sin faltantes).", report }
  } catch (error) {
    return failure(error, "No se pudo validar el tenant.")
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
