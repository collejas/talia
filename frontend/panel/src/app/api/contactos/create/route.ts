import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

type UnknownRecord = Record<string, unknown>

type CreatePayload = {
  crear_cuenta?: boolean
  cuenta?: UnknownRecord
  contacto?: UnknownRecord
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length ? trimmed : undefined
}

function cleanObject(input: UnknownRecord, allowedKeys: string[]): UnknownRecord {
  const out: UnknownRecord = {}
  for (const key of allowedKeys) {
    const value = input[key]
    if (value === null || value === undefined) continue
    if (typeof value === "string") {
      const cleaned = cleanString(value)
      if (cleaned !== undefined) out[key] = cleaned
      continue
    }
    out[key] = value
  }
  return out
}

const ACCOUNT_KEYS = [
  "nombre",
  "alias",
  "tipo",
  "industria",
  "tamano",
  "sitio_web",
  "telefono",
  "correo",
  "propietario_usuario_id",
  "razon_social",
  "rfc",
  "uso_cfdi",
  "metodo_pago",
  "forma_pago",
  "email_facturacion",
  "tipo_industria",
  "notas",
  "necesidad_proposito",
  "tipo_vialidad",
  "nombre_vialidad",
  "numero_exterior",
  "letra_exterior",
  "edificio",
  "edificio_piso",
  "numero_interior",
  "letra_interior",
  "tipo_asentamiento",
  "nombre_asentamiento",
  "tipo_centro_comercial",
  "corredor_industrial",
  "numero_local",
  "codigo_postal",
  "clave_entidad",
  "entidad",
  "clave_municipio",
  "municipio",
  "clave_localidad",
  "localidad",
  "pais",
  "email",
  "website",
  "tipo_establecimiento",
  "latitud",
  "longitud",
] as const

const CONTACT_KEYS = [
  "cuenta_id",
  "nombre_nombres",
  "apellido_paterno",
  "apellido_materno",
  "nombre_completo",
  "persona_fisica_moral",
  "razon_social",
  "rfc",
  "uso_cfdi",
  "metodo_pago",
  "forma_pago",
  "email_facturacion",
  "tipo_industria",
  "tamano",
  "puesto",
  "area",
  "rol_decision",
  "correo",
  "email",
  "telefono_e164",
  "telefono",
  "tipo_vialidad",
  "nombre_vialidad",
  "numero_exterior",
  "letra_exterior",
  "edificio",
  "edificio_piso",
  "numero_interior",
  "letra_interior",
  "tipo_asentamiento",
  "nombre_asentamiento",
  "tipo_centro_comercial",
  "corredor_industrial",
  "numero_local",
  "codigo_postal",
  "clave_entidad",
  "entidad",
  "clave_municipio",
  "municipio",
  "clave_localidad",
  "localidad",
  "pais",
  "website",
  "tipo_establecimiento",
  "latitud",
  "longitud",
  "company_name",
  "notes",
  "notas",
  "necesidad_proposito",
  "estado",
  "propietario_usuario_id",
  "origen",
] as const

export async function POST(request: NextRequest) {
  let payload: CreatePayload
  try {
    payload = (await request.json()) as CreatePayload
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const rawContact = payload?.contacto && typeof payload.contacto === "object" ? payload.contacto : {}
  const contactBody = cleanObject(rawContact as UnknownRecord, [...CONTACT_KEYS])

  const nombre = cleanString(contactBody.nombre_completo)
    ?? [
      cleanString(contactBody.nombre_nombres),
      cleanString(contactBody.apellido_paterno),
      cleanString(contactBody.apellido_materno),
    ].filter(Boolean).join(" ").trim()

  if (!nombre) {
    return NextResponse.json({ error: "nombre_contacto_required" }, { status: 400 })
  }

  contactBody.nombre_completo = nombre

  let createdAccount: UnknownRecord | null = null

  const shouldCreateAccount = Boolean(payload?.crear_cuenta)
  if (shouldCreateAccount) {
    const rawAccount = payload?.cuenta && typeof payload.cuenta === "object" ? payload.cuenta : {}
    const accountBody = cleanObject(rawAccount as UnknownRecord, [...ACCOUNT_KEYS])

    if (!cleanString(accountBody.nombre)) {
      const fallback = cleanString(accountBody.razon_social)
      if (fallback) {
        accountBody.nombre = fallback
      }
    }

    if (!cleanString(accountBody.nombre)) {
      return NextResponse.json({ error: "nombre_cuenta_required" }, { status: 400 })
    }

    const accountRes = await callCrmApi<UnknownRecord>("/crm/cuentas", {
      method: "POST",
      body: accountBody,
      withUserToken: true,
    })

    if (!accountRes.ok) {
      return NextResponse.json(
        { error: accountRes.error || "cuenta_create_failed" },
        { status: accountRes.status ?? 502 },
      )
    }

    createdAccount = accountRes.data
    const accountId = cleanString((createdAccount as UnknownRecord)?.id)
    if (accountId) {
      contactBody.cuenta_id = accountId
      if (!cleanString(contactBody.company_name)) {
        const company =
          cleanString((createdAccount as UnknownRecord)?.nombre)
          ?? cleanString((createdAccount as UnknownRecord)?.razon_social)
        if (company) {
          contactBody.company_name = company
        }
      }
    }
  }

  const contactRes = await callCrmApi<UnknownRecord>("/crm/contacts", {
    method: "POST",
    body: contactBody,
    withUserToken: true,
  })

  if (!contactRes.ok) {
    return NextResponse.json(
      { error: contactRes.error || "contacto_create_failed" },
      { status: contactRes.status ?? 502 },
    )
  }

  return NextResponse.json(
    {
      contacto: contactRes.data,
      cuenta: createdAccount,
    },
    { status: 201 },
  )
}
