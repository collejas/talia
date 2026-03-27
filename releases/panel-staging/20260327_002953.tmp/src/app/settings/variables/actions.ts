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
  console.error("[settings/variables]", error)
  return { status: "error", message }
}

function getText(formData: FormData, key: string): string {
  const value = formData.get(key)
  if (typeof value !== "string") return ""
  return value.trim()
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

function parseSidList(raw: string): string[] {
  if (!raw.trim()) return []
  const tokens = raw
    .split(/\r?\n|,|;/)
    .map((item) => item.trim())
    .filter(Boolean)
  const unique: string[] = []
  const seen = new Set<string>()
  for (const token of tokens) {
    if (!/^HX[0-9a-zA-Z]+$/.test(token)) {
      throw new Error(`SID inválido: ${token}. Debe iniciar con HX.`)
    }
    if (seen.has(token)) continue
    seen.add(token)
    unique.push(token)
  }
  return unique
}

async function upsertTenantSecret(clave: string, valor: string, tier: "A" | "B", etiqueta?: string): Promise<void> {
  const response = await callCrmApi<{ ok: boolean }>(
    "/tenant/me/secrets",
    {
      method: "POST",
      organizacionId: null,
      withUserToken: true,
      body: {
        secrets: [
          {
            clave,
            valor,
            tier,
            etiqueta,
          },
        ],
      },
    },
  )
  if (!response.ok) throw new Error(response.error)
}

export async function updateTenantConfigAction(_: CrudActionState, formData: FormData): Promise<CrudActionState> {
  try {
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

    const response = await callCrmApi<{ ok: boolean }>("/tenant/me/config", {
      method: "PUT",
      organizacionId: null,
      withUserToken: true,
      body: { config },
    })
    if (!response.ok) throw new Error(response.error)

    revalidatePath("/settings/variables")
    return success("Config guardada.")
  } catch (error) {
    return failure(error, "No se pudo guardar la config.")
  }
}

export async function updateTenantInfoAction(_: CrudActionState, formData: FormData): Promise<CrudActionState> {
  try {
    const payload: Record<string, unknown> = {}
    const addString = (key: string, value: string | undefined) => {
      if (value) {
        payload[key] = value
      }
    }

    addString("nombre", getText(formData, "tenant_nombre"))
    addString("razon_social", getText(formData, "tenant_razon_social"))
    addString("rfc", getText(formData, "tenant_rfc"))
    addString("pais", getText(formData, "tenant_pais"))
    addString("estado", getText(formData, "tenant_estado"))
    addString("ciudad", getText(formData, "tenant_ciudad"))
    addString("dominio_principal", getText(formData, "tenant_dominio"))
    addString("telefono", getText(formData, "tenant_telefono"))
    addString("sitio_web", getText(formData, "tenant_sitio"))
    const onboarding = getText(formData, "tenant_estado_onboarding")
    if (onboarding) {
      payload.estado_onboarding = onboarding
    }
    if (formData.get("tenant_activo_present") === "1") {
      payload.activo = formData.has("tenant_activo")
    }

    if (!Object.keys(payload).length) {
      throw new Error("Completa al menos un campo para actualizar.")
    }

    const response = await callCrmApi<{ ok: boolean }>("/tenant/me/settings", {
      method: "PUT",
      organizacionId: null,
      withUserToken: true,
      body: payload,
    })
    if (!response.ok) throw new Error(response.error)

    revalidatePath("/settings/variables")
    return success("Datos generales actualizados.")
  } catch (error) {
    return failure(error, "No se pudieron guardar los datos generales.")
  }
}

export async function setTenantSecretAction(_: CrudActionState, formData: FormData): Promise<CrudActionState> {
  try {
    const clave = getText(formData, "clave")
    const valor = getText(formData, "valor")
    const tier = (getText(formData, "tier") || "A") as "A" | "B"
    const etiqueta = getText(formData, "etiqueta")

    if (!clave) throw new Error("La clave es obligatoria.")
    if (!valor) throw new Error("El valor es obligatorio.")

    await upsertTenantSecret(clave, valor, tier, etiqueta || undefined)

    revalidatePath("/settings/variables")
    return success("Secreto guardado (rotado).")
  } catch (error) {
    return failure(error, "No se pudo guardar el secreto.")
  }
}

export async function deleteTenantSecretAction(_: CrudActionState, formData: FormData): Promise<CrudActionState> {
  try {
    const clave = getText(formData, "clave")
    if (!clave) throw new Error("Falta clave.")

    const response = await callCrmApi<{ ok: boolean }>(
      `/tenant/me/secrets/${encodeURIComponent(clave)}`,
      {
        method: "DELETE",
        organizacionId: null,
        withUserToken: true,
      },
    )
    if (!response.ok) throw new Error(response.error)

    revalidatePath("/settings/variables")
    return success("Secreto eliminado.")
  } catch (error) {
    return failure(error, "No se pudo eliminar el secreto.")
  }
}

export async function updateWebchatSettingsAction(_: CrudActionState, formData: FormData): Promise<CrudActionState> {
  try {
    // En checkboxes HTML, cuando están desmarcados NO viajan en el FormData.
    // Aquí queremos que el usuario pueda guardar explícitamente `false`, así que derivamos el valor desde `has()`.
    const webchatEnabled = formData.has("webchat_enabled")
    const assistantId = getText(formData, "webchat_assistant_id")
    const promptVersion = getText(formData, "webchat_prompt_version")
    const inactivityMinutesRaw = getText(formData, "webchat_inactivity_minutes")
    const persistSession = formData.has("webchat_persist_session")
    const reengageMinutesRaw = getText(formData, "webchat_reengage_minutes")
    const reengageMaxAttemptsRaw = getText(formData, "webchat_reengage_max_attempts")
    const escalateMinutesRaw = getText(formData, "webchat_escalate_minutes")

    const openaiApiKey = getText(formData, "openai_api_key")
    const webchatAlias = getText(formData, "webchat_alias")

    const getResp = await callCrmApi<{
      ok: boolean
      organizacion_id: string
      config: Record<string, unknown>
    }>("/tenant/me/settings", {
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
    const inactivityMinutes = parseNumber(inactivityMinutesRaw)
    if (inactivityMinutes !== undefined) {
      webchatPatch.inactivity_minutes = inactivityMinutes
      webchatPatch.inactivity_hours = null
    }
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

    const putResp = await callCrmApi<{ ok: boolean }>("/tenant/me/config", {
      method: "PUT",
      organizacionId: null,
      withUserToken: true,
      body: { config: merged },
    })
    if (!putResp.ok) throw new Error(putResp.error)

    let aliasWarning: string | null = null
    if (webchatAlias) {
      const routeResp = await callCrmApi<{ ok: boolean }>("/tenant/me/routes", {
        method: "POST",
        organizacionId: null,
        withUserToken: true,
        body: { canal: "webchat", clave: webchatAlias },
      })
      if (!routeResp.ok) {
        if (routeResp.status === 409) {
          aliasWarning = `Alias "${webchatAlias}" ya está registrado; revisa las rutas.`
        } else {
          throw new Error(routeResp.error)
        }
      }
    }

    if (openaiApiKey) {
      await upsertTenantSecret("openai.api_key", openaiApiKey, "B")
    }

    revalidatePath("/settings/variables")
    const baseMessage = "Webchat guardado (config/routing/secretos)."
    return success(aliasWarning ? `${baseMessage} ${aliasWarning}` : baseMessage)
  } catch (error) {
    return failure(error, "No se pudo guardar la configuración de Webchat.")
  }
}

export async function updateCalendarSettingsAction(_: CrudActionState, formData: FormData): Promise<CrudActionState> {
  try {

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
    const zoomEnabled = formData.has("zoom_enabled")
    const zoomAutoCreateMeeting = formData.has("zoom_auto_create_meeting")
    const zoomHostEmail = getText(formData, "zoom_host_email")
    const zoomDefaultDurationMinutesRaw = getText(formData, "zoom_default_duration_minutes")
    const zoomAccountId = getText(formData, "zoom_account_id")
    const zoomClientId = getText(formData, "zoom_client_id")
    const zoomClientSecret = getText(formData, "zoom_client_secret")

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
    const zoomConfigPatch: Record<string, unknown> = {
      enabled: zoomEnabled,
      auto_create_meeting: zoomAutoCreateMeeting,
      provider: "zoom",
    }
    if (zoomHostEmail) zoomConfigPatch.host_email = zoomHostEmail
    const zoomDefaultDurationMinutes = parseNumber(zoomDefaultDurationMinutesRaw)
    if (zoomDefaultDurationMinutes !== undefined) {
      zoomConfigPatch.default_duration_minutes = zoomDefaultDurationMinutes
    }

    const hasCalendarConfig = Object.keys(calendarPatch).length || Object.keys(calendarConfigPatch).length
    const hasZoomSecrets = Boolean(zoomAccountId || zoomClientId || zoomClientSecret)
    if (!hasCalendarConfig && !calendarUsername && !calendarPassword && !hasZoomSecrets) {
      throw new Error("Debes completar al menos un campo del calendario.")
    }

    const getResp = await callCrmApi<{
      ok: boolean
      organizacion_id: string
      config: Record<string, unknown>
    }>("/tenant/me/settings", {
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
    patch.zoom = zoomConfigPatch

    const merged = mergeDeep({ ...currentConfig }, patch)

    const putResp = await callCrmApi<{ ok: boolean }>("/tenant/me/config", {
      method: "PUT",
      organizacionId: null,
      withUserToken: true,
      body: { config: merged },
    })
    if (!putResp.ok) throw new Error(putResp.error)

    if (calendarUsername) {
      await upsertTenantSecret("calendar.username", calendarUsername, "A")
    }
    if (calendarPassword) {
      await upsertTenantSecret("calendar.password", calendarPassword, "B")
    }
    if (zoomAccountId) {
      await upsertTenantSecret("zoom.account_id", zoomAccountId, "A")
    }
    if (zoomClientId) {
      await upsertTenantSecret("zoom.client_id", zoomClientId, "A")
    }
    if (zoomClientSecret) {
      await upsertTenantSecret("zoom.client_secret", zoomClientSecret, "B")
    }

    revalidatePath("/settings/variables")
    return success("Configuración de calendario guardada.")
  } catch (error) {
    return failure(error, "No se pudo guardar la configuración del calendario.")
  }
}

export async function updateMailSettingsAction(_: CrudActionState, formData: FormData): Promise<CrudActionState> {
  try {
    const incomingServer = getText(formData, "mail_incoming_server")
    const incomingPortRaw = getText(formData, "mail_incoming_port_imap")
    const outgoingServer = getText(formData, "mail_outgoing_server")
    const outgoingPortRaw = getText(formData, "mail_outgoing_port_smtp")
    const useSsl = formData.has("mail_use_ssl")
    const useTls = formData.has("mail_use_tls")
    const mailUsername = getText(formData, "mail_username")
    const mailPassword = getText(formData, "mail_password")
    const brevoBaseUrl = getText(formData, "brevo_base_url")
    const brevoApiKey = getText(formData, "brevo_api_key")

    const mailPatch: Record<string, unknown> = {}
    if (incomingServer) mailPatch.incoming_server = incomingServer
    const incomingPort = parseNumber(incomingPortRaw)
    if (incomingPort !== undefined) mailPatch.incoming_port_imap = incomingPort
    if (outgoingServer) mailPatch.outgoing_server = outgoingServer
    const outgoingPort = parseNumber(outgoingPortRaw)
    if (outgoingPort !== undefined) mailPatch.outgoing_port_smtp = outgoingPort
    mailPatch.use_ssl = useSsl
    mailPatch.use_tls = useTls

    const hasMailConfig = Object.keys(mailPatch).length > 0
    const hasBrevoConfig = Boolean(brevoBaseUrl)
    if (!hasMailConfig && !mailUsername && !mailPassword && !hasBrevoConfig && !brevoApiKey) {
      throw new Error("Debes completar al menos un campo de la configuración de correo o Brevo.")
    }

    const getResp = await callCrmApi<{
      ok: boolean
      organizacion_id: string
      config: Record<string, unknown>
    }>("/tenant/me/settings", {
      method: "GET",
      organizacionId: null,
      withUserToken: true,
    })
    if (!getResp.ok) throw new Error(getResp.error)

    const currentConfig = getResp.data.config ?? {}
    const patch: Record<string, unknown> = {}
    if (hasMailConfig) {
      patch.mail = mailPatch
    }
    const brevoPatch: Record<string, unknown> = {}
    if (brevoBaseUrl) brevoPatch.base_url = brevoBaseUrl
    if (Object.keys(brevoPatch).length) {
      patch.brevo = brevoPatch
    }

    const merged = mergeDeep({ ...currentConfig }, patch)

    const putResp = await callCrmApi<{ ok: boolean }>("/tenant/me/config", {
      method: "PUT",
      organizacionId: null,
      withUserToken: true,
      body: { config: merged },
    })
    if (!putResp.ok) throw new Error(putResp.error)

    if (mailUsername) {
      await upsertTenantSecret("mail.username", mailUsername, "A")
    }
    if (mailPassword) {
      await upsertTenantSecret("mail.password", mailPassword, "B")
    }
    if (brevoApiKey) {
      await upsertTenantSecret("brevo.api_key", brevoApiKey, "B")
    }

    revalidatePath("/settings/variables")
    return success("Configuración de correo guardada.")
  } catch (error) {
    return failure(error, "No se pudo guardar la configuración del correo.")
  }
}

export async function updateBusquedaSettingsAction(_: CrudActionState, formData: FormData): Promise<CrudActionState> {
  try {
    const baseUrl = getText(formData, "denue_base_url")
    const token = getText(formData, "denue_token")
    const googleNearbyUrl = getText(formData, "google_nearby_url")
    const googleTextUrl = getText(formData, "google_text_url")
    const googleDetailsUrl = getText(formData, "google_details_url")
    const googleFieldMask = getText(formData, "google_field_mask")
    const googleDetailsFieldMask = getText(formData, "google_details_field_mask")
    const googleLanguageCode = getText(formData, "google_language_code")
    const googleRegionCode = getText(formData, "google_region_code")
    const googleGridRadius = parseNumber(getText(formData, "google_grid_max_tile_radius_m"))
    const googlePauseBetweenPages = parseNumber(getText(formData, "google_pause_between_pages"))
    const googleDenseGridRadius = parseNumber(getText(formData, "google_dense_grid_max_tile_radius_m"))
    const googleDensePause = parseNumber(getText(formData, "google_dense_pause_between_pages"))
    const googleDenseMaxResults = parseNumber(getText(formData, "google_dense_max_results"))
    const googleApiKey = getText(formData, "google_places_api_key")

    if (
      !baseUrl &&
      !token &&
      !googleApiKey &&
      !googleNearbyUrl &&
      !googleTextUrl &&
      !googleDetailsUrl &&
      !googleFieldMask &&
      !googleDetailsFieldMask &&
      !googleLanguageCode &&
      !googleRegionCode &&
      googleGridRadius === undefined &&
      googlePauseBetweenPages === undefined &&
      googleDenseGridRadius === undefined &&
      googleDensePause === undefined &&
      googleDenseMaxResults === undefined
    ) {
      throw new Error("Debes completar al menos un campo de la configuración de búsqueda.")
    }

    let currentConfig: Record<string, unknown> = {}
    const needConfigUpdate =
      Boolean(baseUrl) ||
      Boolean(googleNearbyUrl) ||
      Boolean(googleTextUrl) ||
      Boolean(googleDetailsUrl) ||
      Boolean(googleFieldMask) ||
      Boolean(googleDetailsFieldMask) ||
      Boolean(googleLanguageCode) ||
      Boolean(googleRegionCode) ||
      googleGridRadius !== undefined ||
      googlePauseBetweenPages !== undefined ||
      googleDenseGridRadius !== undefined ||
      googleDensePause !== undefined ||
      googleDenseMaxResults !== undefined
    if (needConfigUpdate) {
      const getResp = await callCrmApi<{
        ok: boolean
        organizacion_id: string
        config: Record<string, unknown>
      }>("/tenant/me/settings", {
        method: "GET",
        organizacionId: null,
        withUserToken: true,
      })
      if (!getResp.ok) throw new Error(getResp.error)
      currentConfig = getResp.data.config ?? {}
    }

    const patch: Record<string, unknown> = {}
    if (baseUrl) {
      patch.denue = { base_url: baseUrl }
    }
    const googlePatch: Record<string, unknown> = {}
    if (googleNearbyUrl) googlePatch.nearby_url = googleNearbyUrl
    if (googleTextUrl) googlePatch.text_url = googleTextUrl
    if (googleDetailsUrl) googlePatch.details_url = googleDetailsUrl
    if (googleFieldMask) googlePatch.field_mask = googleFieldMask
    if (googleDetailsFieldMask) googlePatch.details_field_mask = googleDetailsFieldMask
    if (googleLanguageCode) googlePatch.language_code = googleLanguageCode
    if (googleRegionCode) googlePatch.region_code = googleRegionCode
    if (googleGridRadius !== undefined) googlePatch.grid_max_tile_radius_m = googleGridRadius
    if (googlePauseBetweenPages !== undefined) googlePatch.pause_between_pages = googlePauseBetweenPages
    if (googleDenseGridRadius !== undefined) {
      googlePatch.dense_grid_max_tile_radius_m = googleDenseGridRadius
    }
    if (googleDensePause !== undefined) {
      googlePatch.dense_pause_between_pages = googleDensePause
    }
    if (googleDenseMaxResults !== undefined) {
      googlePatch.dense_max_results = googleDenseMaxResults
    }
    if (Object.keys(googlePatch).length) {
      patch.google_places = googlePatch
    }

    if (Object.keys(patch).length) {
      const merged = mergeDeep({ ...currentConfig }, patch)
      const putResp = await callCrmApi<{ ok: boolean }>("/tenant/me/config", {
        method: "PUT",
        organizacionId: null,
        withUserToken: true,
        body: { config: merged },
      })
      if (!putResp.ok) throw new Error(putResp.error)
    }

    if (token) {
      await upsertTenantSecret("denue.token", token, "A")
    }
    if (googleApiKey) {
      await upsertTenantSecret("google.places_api_key", googleApiKey, "B")
    }

    revalidatePath("/settings/variables")
    return success("Configuración de búsqueda guardada.")
  } catch (error) {
    return failure(error, "No se pudo guardar la configuración de búsqueda.")
  }
}

export async function updateTwilioSettingsAction(_: CrudActionState, formData: FormData): Promise<CrudActionState> {
  try {
    const phoneNumber = getText(formData, "twilio_phone_number")
    const phoneNumberSid = getText(formData, "twilio_phone_number_sid")
    const validateSignatures = formData.has("twilio_validate_signatures")
    const webhookPath = getText(formData, "voice_webhook_path")
    const fullDuplex = formData.has("voice_full_duplex")
    const debugVerbose = formData.has("voice_debug_verbose")
    const debugEnergyRaw = getText(formData, "voice_debug_energy_every_n")

    const accountSid = getText(formData, "twilio_account_sid")
    const authToken = getText(formData, "twilio_auth_token")
    const streamJwtSecret = getText(formData, "voice_stream_jwt_secret")

    const twilioPatch: Record<string, unknown> = {}
    if (phoneNumber) twilioPatch.phone_number = phoneNumber
    if (phoneNumberSid) twilioPatch.phone_number_sid = phoneNumberSid
    twilioPatch.validate_signatures = validateSignatures

    const voicePatch: Record<string, unknown> = {
      full_duplex: fullDuplex,
      debug_verbose: debugVerbose,
    }
    if (webhookPath) voicePatch.webhook_path = webhookPath
    const debugEnergy = parseNumber(debugEnergyRaw)
    if (debugEnergy !== undefined) voicePatch.energy_every_n = debugEnergy

    const hasConfigUpdate = Boolean(Object.keys(twilioPatch).length || Object.keys(voicePatch).length)
    if (!hasConfigUpdate && !accountSid && !authToken && !streamJwtSecret) {
      throw new Error("Debes completar al menos un campo de la configuración de Twilio.")
    }

    const getResp = await callCrmApi<{
      ok: boolean
      organizacion_id: string
      config: Record<string, unknown>
    }>("/tenant/me/settings", {
      method: "GET",
      organizacionId: null,
      withUserToken: true,
    })
    if (!getResp.ok) throw new Error(getResp.error)

    const currentConfig = getResp.data.config ?? {}
    const patch: Record<string, unknown> = {}
    if (Object.keys(twilioPatch).length) patch.twilio = twilioPatch
    if (Object.keys(voicePatch).length) patch.voice = voicePatch

    const merged = mergeDeep({ ...currentConfig }, patch)

    const putResp = await callCrmApi<{ ok: boolean }>("/tenant/me/config", {
      method: "PUT",
      organizacionId: null,
      withUserToken: true,
      body: { config: merged },
    })
    if (!putResp.ok) throw new Error(putResp.error)

    if (accountSid) {
      await upsertTenantSecret("twilio.account_sid", accountSid, "A")
    }
    if (authToken) {
      await upsertTenantSecret("twilio.auth_token", authToken, "B")
    }
    if (streamJwtSecret) {
      await upsertTenantSecret("voice.stream_jwt_secret", streamJwtSecret, "B")
    }

    revalidatePath("/settings/variables")
    return success("Configuración de Twilio guardada.")
  } catch (error) {
    return failure(error, "No se pudo guardar la configuración de Twilio.")
  }
}

export async function updateWhatsAppSettingsAction(_: CrudActionState, formData: FormData): Promise<CrudActionState> {
  try {
    const promptId = getText(formData, "whatsapp_prompt_id")
    const promptVersion = getText(formData, "whatsapp_prompt_version")
    const assistantId = getText(formData, "whatsapp_assistant_id")
    const inactivityMinutesRaw = getText(formData, "whatsapp_inactivity_minutes")
    const reengageMinutesRaw = getText(formData, "whatsapp_reengage_minutes")
    const reengageMaxAttemptsRaw = getText(formData, "whatsapp_reengage_max_attempts")
    const escalateMinutesRaw = getText(formData, "whatsapp_escalate_minutes")
    const templateSales = getText(formData, "whatsapp_template_sales")
    const templateAppointment = getText(formData, "whatsapp_template_appointment")
    const templateCancel = getText(formData, "whatsapp_template_cancel")
    const templateProspeccionRaw = getText(formData, "whatsapp_template_prospeccion_sids")
    const prospeccionPromptId = getText(formData, "whatsapp_prospeccion_prompt_id")
    const prospeccionPromptVersion = getText(formData, "whatsapp_prospeccion_prompt_version")

    const whatsappPatch: Record<string, unknown> = {}
    if (promptId) whatsappPatch.prompt_id = promptId
    if (promptVersion) whatsappPatch.prompt_version = promptVersion
    if (assistantId) whatsappPatch.assistant_id = assistantId
    const inactivityMinutes = parseNumber(inactivityMinutesRaw)
    if (inactivityMinutes !== undefined) whatsappPatch.inactivity_minutes = inactivityMinutes
    const reengageMinutes = parseNumber(reengageMinutesRaw)
    if (reengageMinutes !== undefined) whatsappPatch.reengage_minutes = reengageMinutes
    const reengageMaxAttempts = parseNumber(reengageMaxAttemptsRaw)
    if (reengageMaxAttempts !== undefined) whatsappPatch.reengage_max_attempts = reengageMaxAttempts
    const escalateMinutes = parseNumber(escalateMinutesRaw)
    if (escalateMinutes !== undefined) whatsappPatch.escalate_minutes = escalateMinutes

    const templatesPatch: Record<string, unknown> = {}
    if (templateSales) templatesPatch.sales = templateSales
    if (templateAppointment) templatesPatch.appointment = templateAppointment
    if (templateCancel) templatesPatch.cancel = templateCancel
    const templateProspeccion = parseSidList(templateProspeccionRaw)
    if (templateProspeccion.length) templatesPatch.prospeccion = templateProspeccion
    if (Object.keys(templatesPatch).length) {
      whatsappPatch.templates = templatesPatch
    }
    const prospeccionPatch: Record<string, unknown> = {}
    if (prospeccionPromptId) prospeccionPatch.prompt_id = prospeccionPromptId
    if (prospeccionPromptVersion) prospeccionPatch.prompt_version = prospeccionPromptVersion
    if (Object.keys(prospeccionPatch).length) {
      whatsappPatch.prospeccion = prospeccionPatch
    }

    if (!Object.keys(whatsappPatch).length) {
      throw new Error("Debes completar al menos un campo de la configuración de WhatsApp.")
    }

    const getResp = await callCrmApi<{
      ok: boolean
      organizacion_id: string
      config: Record<string, unknown>
    }>("/tenant/me/settings", {
      method: "GET",
      organizacionId: null,
      withUserToken: true,
    })
    if (!getResp.ok) throw new Error(getResp.error)

    const currentConfig = getResp.data.config ?? {}
    const patch: Record<string, unknown> = { whatsapp: whatsappPatch }
    const merged = mergeDeep({ ...currentConfig }, patch)

    const putResp = await callCrmApi<{ ok: boolean }>("/tenant/me/config", {
      method: "PUT",
      organizacionId: null,
      withUserToken: true,
      body: { config: merged },
    })
    if (!putResp.ok) throw new Error(putResp.error)

    revalidatePath("/settings/variables")
    return success("Configuración de WhatsApp guardada.")
  } catch (error) {
    return failure(error, "No se pudo guardar la configuración de WhatsApp.")
  }
}

export async function updateMessengerSettingsAction(_: CrudActionState, formData: FormData): Promise<CrudActionState> {
  try {
    const promptId = getText(formData, "messenger_prompt_id")
    const promptVersion = getText(formData, "messenger_prompt_version")
    const assistantId = getText(formData, "messenger_assistant_id")
    const inactivityHoursRaw = getText(formData, "messenger_inactivity_hours")

    const pageAccessToken = getText(formData, "messenger_page_access_token")
    const verifyToken = getText(formData, "messenger_verify_token")
    const appSecret = getText(formData, "messenger_app_secret")

    const messengerPatch: Record<string, unknown> = {}
    if (assistantId) messengerPatch.assistant_id = assistantId
    if (promptId) messengerPatch.prompt_id = promptId
    if (promptVersion) messengerPatch.prompt_version = promptVersion
    const inactivityHours = parseNumber(inactivityHoursRaw)
    if (inactivityHours !== undefined) messengerPatch.inactivity_hours = inactivityHours

    if (!Object.keys(messengerPatch).length && !pageAccessToken && !verifyToken && !appSecret) {
      throw new Error("Debes completar al menos un campo de Messenger.")
    }

    const getResp = await callCrmApi<{
      ok: boolean
      organizacion_id: string
      config: Record<string, unknown>
    }>("/tenant/me/settings", {
      method: "GET",
      organizacionId: null,
      withUserToken: true,
    })
    if (!getResp.ok) throw new Error(getResp.error)

    const currentConfig = getResp.data.config ?? {}
    const patch: Record<string, unknown> = {}
    if (Object.keys(messengerPatch).length) {
      patch.messenger = messengerPatch
    }

    if (Object.keys(patch).length) {
      const merged = mergeDeep({ ...currentConfig }, patch)
      const putResp = await callCrmApi<{ ok: boolean }>("/tenant/me/config", {
        method: "PUT",
        organizacionId: null,
        withUserToken: true,
        body: { config: merged },
      })
      if (!putResp.ok) throw new Error(putResp.error)
    }

    if (pageAccessToken) {
      await upsertTenantSecret("meta.messenger.page_access_token", pageAccessToken, "B")
    }
    if (verifyToken) {
      await upsertTenantSecret("meta.messenger.verify_token", verifyToken, "A")
    }
    if (appSecret) {
      await upsertTenantSecret("meta.messenger.app_secret", appSecret, "B")
    }

    revalidatePath("/settings/variables")
    return success("Configuración de Messenger guardada.")
  } catch (error) {
    return failure(error, "No se pudo guardar la configuración de Messenger.")
  }
}

export async function updateOpenaiGeneralAction(_: CrudActionState, formData: FormData): Promise<CrudActionState> {
  try {
    const generalProjectId = getText(formData, "openai_general_project_id")
    const generalApiKey = getText(formData, "openai_general_api_key")

    if (!generalProjectId && !generalApiKey) {
      throw new Error("Debes completar al menos el project_id o la clave del bloque General.")
    }

    const configPatch: Record<string, unknown> = {}
    const generalPatch: Record<string, unknown> = {}
    if (generalProjectId) generalPatch.project_id = generalProjectId
    if (Object.keys(generalPatch).length) {
      configPatch.openai = { general: generalPatch }
    }

    if (Object.keys(configPatch).length) {
      const getResp = await callCrmApi<{
        ok: boolean
        organizacion_id: string
        config: Record<string, unknown>
      }>("/tenant/me/settings", {
        method: "GET",
        organizacionId: null,
        withUserToken: true,
      })
      if (!getResp.ok) throw new Error(getResp.error)

      const currentConfig = getResp.data.config ?? {}
      const merged = mergeDeep({ ...currentConfig }, configPatch)

      const putResp = await callCrmApi<{ ok: boolean }>("/tenant/me/config", {
        method: "PUT",
        organizacionId: null,
        withUserToken: true,
        body: { config: merged },
      })
      if (!putResp.ok) throw new Error(putResp.error)
    }

    if (generalApiKey) {
      await upsertTenantSecret("openai.general.api_key", generalApiKey, "B")
    }

    revalidatePath("/settings/variables")
    return success("Configuración general de OpenAI guardada.")
  } catch (error) {
    return failure(error, "No se pudo guardar la configuración general de OpenAI.")
  }
}

export async function updateOpenaiVoiceAction(_: CrudActionState, formData: FormData): Promise<CrudActionState> {
  try {
    const voicePromptId = getText(formData, "openai_voice_prompt_id")
    const voicePromptVersion = getText(formData, "openai_voice_prompt_version")
    const voiceModel = getText(formData, "openai_voice_model")
    const voiceMaxTokensRaw = getText(formData, "openai_voice_max_tokens")
    const voiceSttModel = getText(formData, "openai_voice_stt_model")
    const voiceApiKey = getText(formData, "openai_voice_api_key")

    const voicePatch: Record<string, unknown> = {}
    if (voicePromptId) voicePatch.prompt_id = voicePromptId
    if (voicePromptVersion) voicePatch.prompt_version = voicePromptVersion
    if (voiceModel) voicePatch.model = voiceModel
    const voiceMaxTokens = parseNumber(voiceMaxTokensRaw)
    if (voiceMaxTokens !== undefined) voicePatch.max_tokens = voiceMaxTokens
    if (voiceSttModel) voicePatch.stt_model = voiceSttModel

    if (!Object.keys(voicePatch).length && !voiceApiKey) {
      throw new Error("Debes completar al menos un campo del bloque Voz.")
    }

    if (Object.keys(voicePatch).length) {
      const getResp = await callCrmApi<{
        ok: boolean
        organizacion_id: string
        config: Record<string, unknown>
      }>("/tenant/me/settings", {
        method: "GET",
        organizacionId: null,
        withUserToken: true,
      })
      if (!getResp.ok) throw new Error(getResp.error)

      const currentConfig = getResp.data.config ?? {}
      const merged = mergeDeep({ ...currentConfig }, { openai: { voice: voicePatch } })

      const putResp = await callCrmApi<{ ok: boolean }>("/tenant/me/config", {
        method: "PUT",
        organizacionId: null,
        withUserToken: true,
        body: { config: merged },
      })
      if (!putResp.ok) throw new Error(putResp.error)
    }

    if (voiceApiKey) {
      await upsertTenantSecret("openai.voice.api_key", voiceApiKey, "B")
    }

    revalidatePath("/settings/variables")
    return success("Configuración de voz de OpenAI guardada.")
  } catch (error) {
    return failure(error, "No se pudo guardar la configuración de voz de OpenAI.")
  }
}

export async function validateTenantAction(_: CrudActionState, formData: FormData): Promise<CrudActionState> {
  try {
    const scope = getText(formData, "scope") || "full"
    const resp = await callCrmApi<{
      ok: boolean
      missing_routes: string[]
      missing_secrets: string[]
      missing_config: string[]
      notes: string[]
    }>("/tenant/me/validate", {
      method: "POST",
      organizacionId: null,
      withUserToken: true,
      body: { scope },
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
    const canal = getText(formData, "canal")
    const clave = getText(formData, "clave")

    if (!canal) throw new Error("El canal es obligatorio.")
    if (!clave) throw new Error("La clave es obligatoria.")

    const response = await callCrmApi<{ ok: boolean }>("/tenant/me/routes", {
      method: "POST",
      organizacionId: null,
      withUserToken: true,
      body: { canal, clave },
    })
    if (!response.ok) throw new Error(response.error)

    revalidatePath("/settings/variables")
    return success("Ruta creada.")
  } catch (error) {
    return failure(error, "No se pudo crear la ruta.")
  }
}

export async function deleteTenantRouteAction(_: CrudActionState, formData: FormData): Promise<CrudActionState> {
  try {
    const routeId = getText(formData, "route_id")
    if (!routeId) throw new Error("Falta route_id.")

    const encodedRouteId = encodeURIComponent(routeId)
    const response = await callCrmApi<{ ok: boolean }>(`/tenant/me/routes/${encodedRouteId}`, {
      method: "DELETE",
      organizacionId: null,
      withUserToken: true,
    })
    if (!response.ok) throw new Error(response.error)

    revalidatePath("/settings/variables")
    return success("Ruta eliminada.")
  } catch (error) {
    return failure(error, "No se pudo eliminar la ruta.")
  }
}
