"use server"

import { getSupabaseConfig } from "@/lib/auth/supabase"
import { sendInviteEmailViaSmtp } from "@/lib/mail/send-invite-email"

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
  console.info("[settings/hr] Invitando usuario auth", {
    email: input.email,
    redirect_to: RESET_REDIRECT_URL,
    organizacion_id: metadata.organizacion_id,
  })

  const inviteBody: Record<string, unknown> = {
    type: "invite",
    email: input.email,
  }
  if (RESET_REDIRECT_URL) {
    inviteBody.redirect_to = RESET_REDIRECT_URL
  }
  if (Object.keys(metadata).length) {
    inviteBody.data = metadata
  }

  const inviteResponse = await fetch(`${baseUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(inviteBody),
    cache: "no-store",
  })

  if (!inviteResponse.ok) {
    const errorText = await getErrorMessage(inviteResponse)
    throw new Error(errorText || "No se pudo invitar al usuario en Supabase Auth.")
  }

  const inviteResult = (await inviteResponse.json()) as {
    id?: string
    user?: { id?: string }
    action_link?: string
  }
  const invitedUserId = inviteResult?.id ?? inviteResult?.user?.id
  const actionLink = inviteResult?.action_link
  if (!invitedUserId) {
    throw new Error("Supabase Auth no regresó un identificador de usuario al invitar.")
  }
  if (!actionLink) {
    throw new Error("Supabase Auth no regresó el enlace de invitación.")
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

  await sendInviteEmailViaSmtp({
    to: input.email,
    nombre: input.nombre,
    actionLink,
  })

  return { id: invitedUserId }
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
