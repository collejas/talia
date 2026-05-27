"use server"

import { getSupabaseConfig } from "@/lib/auth/supabase"
const SERVICE_KEY_ENV_KEYS = [
  "SUPABASE_SERVICE_ROLE",
  "SUPABASE_SERVICE_KEY",
  "SUPABASE_SERVICE_API_KEY",
] as const

export type CreateAuthUserInput = {
  email: string
  password: string
  telefono?: string | null
  nombre?: string | null
  organizacion_id: string
}

export type CreateAuthUserResult = {
  id: string
  recoveryEmailSent: boolean
}

const DEFAULT_TELEFONO_E164 = "+00000000000"
const RESET_REDIRECT_URL = process.env.SUPABASE_RESET_REDIRECT_URL?.trim()

export async function createSupabaseAuthUser(
  input: CreateAuthUserInput,
): Promise<CreateAuthUserResult> {
  const config = getSupabaseConfig()
  if (!config) {
    throw new Error("Supabase no está configurado.")
  }
  const serviceKey = getServiceRoleKey()
  if (!serviceKey) {
    throw new Error("Configura SUPABASE_SERVICE_ROLE para crear usuarios.")
  }

  const telefono = input.telefono?.trim() ?? ""
  const hasTelefono = telefono.length > 0
  const baseUrl = config.url.replace(/\/+$/, "")
  const metadata: Record<string, unknown> = {
    organizacion_id: input.organizacion_id,
  }
  if (input.nombre) {
    metadata.nombre = input.nombre
  }
  if (hasTelefono) {
    metadata.telefono_e164 = telefono
  }

  const createPayload = {
    email: input.email,
    password: input.password,
    email_confirm: true,
    phone: hasTelefono ? telefono : DEFAULT_TELEFONO_E164,
    phone_confirm: hasTelefono,
    user_metadata: metadata,
    app_metadata: {
      organizacion_id: input.organizacion_id,
    },
  }

  console.info("[settings/hr] Creando usuario auth", {
    email: input.email,
    phone: createPayload.phone,
    redirect_to: RESET_REDIRECT_URL,
  })

  const createResponse = await fetch(`${baseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(createPayload),
    cache: "no-store",
  })

  if (!createResponse.ok) {
    const errorText = await getErrorMessage(createResponse)
    throw new Error(errorText || "No se pudo crear el usuario en Supabase Auth.")
  }

  const created = (await createResponse.json()) as { id?: string }
  const invitedUserId = created?.id
  if (!invitedUserId) {
    throw new Error("Supabase Auth no regresó un identificador de usuario.")
  }

  const updatePayload = {
    phone: hasTelefono ? telefono : DEFAULT_TELEFONO_E164,
    phone_confirm: hasTelefono,
    user_metadata: metadata,
    app_metadata: {
      organizacion_id: input.organizacion_id,
    },
  }

  const updateResponse = await fetch(`${baseUrl}/auth/v1/admin/users/${invitedUserId}`, {
    method: "PUT",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updatePayload),
    cache: "no-store",
  })

  if (!updateResponse.ok) {
    const errorText = await getErrorMessage(updateResponse)
    throw new Error(errorText || "No se pudo actualizar la información del usuario invitado.")
  }

  const recoveryEmailSent = await triggerSupabaseRecovery(baseUrl, serviceKey, input.email)

  return { id: invitedUserId, recoveryEmailSent }
}

function getServiceRoleKey(): string | null {
  for (const key of SERVICE_KEY_ENV_KEYS) {
    const value = process.env[key]
    if (value && value.trim().length) {
      return value.trim()
    }
  }
  return null
}

async function getErrorMessage(response: Response): Promise<string> {
  try {
    const json = (await response.json()) as { msg?: string; error?: string }
    if (json.msg) return json.msg
    if (json.error) return json.error
    return `Supabase respondió ${response.status}`
  } catch {
    return `Supabase respondió ${response.status}`
  }
}

async function triggerSupabaseRecovery(
  baseUrl: string,
  serviceKey: string,
  email: string,
): Promise<boolean> {
  const response = await fetch(`${baseUrl}/auth/v1/recover`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      options: RESET_REDIRECT_URL ? { redirect_to: RESET_REDIRECT_URL } : undefined,
    }),
    cache: "no-store",
  })

  if (!response.ok) {
    const errorText = await getErrorMessage(response)
    console.warn("[settings/hr] recovery email failed", {
      email,
      error: errorText,
    })
    return false
  }

  return true
}

export async function deleteSupabaseAuthUser(userId: string): Promise<void> {
  const config = getSupabaseConfig()
  if (!config) {
    throw new Error("Supabase no está configurado.")
  }
  const serviceKey = getServiceRoleKey()
  if (!serviceKey) {
    throw new Error("Configura SUPABASE_SERVICE_ROLE para eliminar usuarios.")
  }
  const baseUrl = config.url.replace(/\/+$/, "")
  const response = await fetch(`${baseUrl}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    cache: "no-store",
  })
  if (!response.ok) {
    const errorText = await getErrorMessage(response)
    throw new Error(errorText || "No se pudo eliminar el usuario en Supabase Auth.")
  }
}
