"use server"

import { getSupabaseConfig } from "@/lib/auth/supabase"
const SERVICE_KEY_ENV_KEYS = [
  "SUPABASE_SERVICE_ROLE",
  "SUPABASE_SERVICE_KEY",
  "SUPABASE_SERVICE_API_KEY",
] as const

export type CreateAuthUserInput = {
  email: string
  telefono?: string | null
  nombre?: string | null
  organizacion_id: string
}

export type CreateAuthUserResult = {
  id: string
  inviteEmailSent: boolean
}

const DEFAULT_TELEFONO_E164 = "+00000000000"

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

  const createPayload: { email: string; data: Record<string, unknown> } = {
    email: input.email,
    data: {
      organizacion_id: input.organizacion_id,
      nombre: input.nombre || undefined,
      telefono_e164: hasTelefono ? telefono : undefined,
    },
  }
  createPayload.data = Object.fromEntries(
    Object.entries(createPayload.data).filter(([, value]) => value != null),
  )

  console.info("[settings/hr] Creando usuario auth", {
    email: input.email,
    phone: hasTelefono ? telefono : DEFAULT_TELEFONO_E164,
  })

  const createResponse = await fetch(`${baseUrl}/auth/v1/invite`, {
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
    throw new Error(errorText || "No se pudo invitar el usuario en Supabase Auth.")
  }

  const created = (await createResponse.json()) as { id?: string }
  const invitedUserId = created?.id
  if (!invitedUserId) {
    throw new Error("Supabase Auth no regresó un identificador de usuario.")
  }

  return { id: invitedUserId, inviteEmailSent: true }
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
