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
  const payload = {
    email: input.email,
    password: input.password,
    email_confirm: true,
    phone: hasTelefono ? telefono : DEFAULT_TELEFONO_E164,
    phone_confirm: hasTelefono,
    user_metadata: {
      nombre: input.nombre,
      organizacion_id: input.organizacion_id,
    },
    app_metadata: {
      organizacion_id: input.organizacion_id,
    },
  }

  console.info("[settings/hr] Creando usuario auth", {
    email: payload.email,
    phone: payload.phone,
    phone_confirm: payload.phone_confirm,
    organizacion_id: payload.app_metadata.organizacion_id,
  })

  const response = await fetch(`${config.url.replace(/\/+$/, "")}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  })

  if (!response.ok) {
    const errorText = await getErrorMessage(response)
    throw new Error(errorText || "No se pudo crear el usuario en Supabase Auth.")
  }

  const result = (await response.json()) as { id?: string }
  if (!result?.id) {
    throw new Error("Supabase Auth no regresó un identificador.")
  }
  return { id: result.id }
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
