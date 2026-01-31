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

function parseNumber(raw: string): number | undefined {
  if (!raw) return undefined
  const num = Number(raw)
  return Number.isFinite(num) ? num : undefined
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

    // En checkboxes HTML, cuando están desmarcados NO viajan en el FormData.
    // Aquí queremos que el usuario pueda guardar explícitamente `false`, así que derivamos el valor desde `has()`.
    const webchatEnabled = formData.has("webchat_enabled")
    const assistantId = getText(formData, "webchat_assistant_id")
    const promptVersion = getText(formData, "webchat_prompt_version")
    const inactivityHoursRaw = getText(formData, "webchat_inactivity_hours")
    const persistSession = formData.has("webchat_persist_session")
    const reengageMinutesRaw = getText(formData, "webchat_reengage_minutes")
    const reengageMaxAttemptsRaw = getText(formData, "webchat_reengage_max_attempts")
    const escalateMinutesRaw = getText(formData, "webchat_escalate_minutes")

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

    patch.features = { webchat: { enabled: webchatEnabled } }

    const webchatPatch: Record<string, unknown> = {}
    if (assistantId) webchatPatch.assistant_id = assistantId
    if (promptVersion) webchatPatch.prompt_version = promptVersion
    const inactivityHours = parseNumber(inactivityHoursRaw)
    if (inactivityHours !== undefined) webchatPatch.inactivity_hours = inactivityHours
    webchatPatch.persist_session = persistSession
    const reengageMinutes = parseNumber(reengageMinutesRaw)
    if (reengageMinutes !== undefined) webchatPatch.reengage_minutes = reengageMinutes
    const reengageMaxAttempts = parseNumber(reengageMaxAttemptsRaw)
    if (reengageMaxAttempts !== undefined) webchatPatch.reengage_max_attempts = reengageMaxAttempts
    const escalateMinutes = parseNumber(escalateMinutesRaw)
    if (escalateMinutes !== undefined) webchatPatch.escalate_minutes = escalateMinutes

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

export async function updateCalendarSettingsAction(_: CrudActionState, formData: FormData): Promise<CrudActionState> {
  try {
    const tenantId = requireTenantId(formData)

    const calendarResourceId = getText(formData, "calendar_resource_id")
    const calendarTimezone = getText(formData, "calendar_timezone")
    const calendarDefaultDaysRaw = getText(formData, "calendar_default_days")
    const calendarHoldMinutesRaw = getText(formData, "calendar_hold_minutes")
    const calendarProvider = getText(formData, "calendar_provider")
    const calendarServerUrl = getText(formData, "calendar_server_url")
    const calendarServerUrlAlternate = getText(formData, "calendar_server_url_alternate")
    const calendarServerPortRaw = getText(formData, "calendar_server_port")
    const calendarFullCalendarUrl = getText(formData, "calendar_full_calendar_url")
    const calendarFullContactListUrl = getText(formData, "calendar_full_contact_list_url")
    const calendarUsername = getText(formData, "calendar_username")
    const calendarPassword = getText(formData, "calendar_password")

    const calendarPatch: Record<string, unknown> = {}
    if (calendarResourceId) calendarPatch.resource_id = calendarResourceId
    if (calendarTimezone) calendarPatch.timezone = calendarTimezone
    const calendarDefaultDays = parseNumber(calendarDefaultDaysRaw)
    if (calendarDefaultDays !== undefined) calendarPatch.default_days = calendarDefaultDays
    const calendarHoldMinutes = parseNumber(calendarHoldMinutesRaw)
    if (calendarHoldMinutes !== undefined) calendarPatch.hold_minutes = calendarHoldMinutes
    const calendarConfigPatch: Record<string, unknown> = {}
    if (calendarProvider) calendarConfigPatch.provider = calendarProvider
    if (calendarServerUrl) calendarConfigPatch.server_url = calendarServerUrl
    if (calendarServerUrlAlternate) calendarConfigPatch.server_url_alternate = calendarServerUrlAlternate
    const calendarServerPort = parseNumber(calendarServerPortRaw)
    if (calendarServerPort !== undefined) calendarConfigPatch.server_port = calendarServerPort
    if (calendarFullCalendarUrl) calendarConfigPatch.full_calendar_url = calendarFullCalendarUrl
    if (calendarFullContactListUrl) calendarConfigPatch.full_contact_list_url = calendarFullContactListUrl

    const hasCalendarConfig = Object.keys(calendarPatch).length || Object.keys(calendarConfigPatch).length
    if (!hasCalendarConfig && !calendarUsername && !calendarPassword) {
      throw new Error("Debes completar al menos un campo del calendario.")
    }

    const getResp = await callCrmApi<{ ok: boolean; config: Record<string, unknown> }>(`/admin/tenants/${tenantId}/config`, {
      method: "GET",
      organizacionId: null,
      withUserToken: true,
    })
    if (!getResp.ok) throw new Error(getResp.error)

    const currentConfig = getResp.data.config ?? {}
    const patch: Record<string, unknown> = {}

    if (Object.keys(calendarPatch).length) {
      patch.webchat = { calendar: calendarPatch }
    }
    if (Object.keys(calendarConfigPatch).length) {
      patch.calendar = calendarConfigPatch
    }

    const merged = mergeDeep({ ...currentConfig }, patch)

    const putResp = await callCrmApi<{ ok: boolean }>(`/admin/tenants/${tenantId}/config`, {
      method: "PUT",
      organizacionId: null,
      withUserToken: true,
      body: { config: merged },
    })
    if (!putResp.ok) throw new Error(putResp.error)

    async function upsertSecret(clave: string, valor: string, tier: "A" | "B") {
      const secretResp = await callCrmApi<{ ok: boolean }>(
        `/admin/tenants/${tenantId}/secrets/${encodeURIComponent(clave)}`,
        {
          method: "PUT",
          organizacionId: null,
          withUserToken: true,
          body: { valor, tier },
        },
      )
      if (!secretResp.ok) throw new Error(secretResp.error)
    }

    if (calendarUsername) {
      await upsertSecret("calendar.username", calendarUsername, "A")
    }
    if (calendarPassword) {
      await upsertSecret("calendar.password", calendarPassword, "B")
    }

    revalidatePath(`/settings/tenants/${tenantId}`)
    return success("Configuración de calendario guardada.")
  } catch (error) {
    return failure(error, "No se pudo guardar la configuración del calendario.")
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
