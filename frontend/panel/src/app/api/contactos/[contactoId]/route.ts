import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

type UnknownRecord = Record<string, unknown>

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length ? trimmed : undefined
}

function cleanObject(input: UnknownRecord, allowedKeys: readonly string[]): UnknownRecord {
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

const CONTACT_UPDATE_KEYS = [
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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ contactoId: string }> },
) {
  const { contactoId } = await params
  if (!contactoId) {
    return NextResponse.json({ error: "contacto_id_required" }, { status: 400 })
  }

  const response = await callCrmApi(`/crm/contacts/${contactoId}`, {
    method: "GET",
    withUserToken: true,
  })

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "contact_detail_failed" },
      { status: response.status ?? 502 },
    )
  }

  return NextResponse.json(response.data)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ contactoId: string }> },
) {
  const { contactoId } = await params
  if (!contactoId) {
    return NextResponse.json({ error: "contacto_id_required" }, { status: 400 })
  }

  let payload: UnknownRecord
  try {
    payload = (await request.json()) as UnknownRecord
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const sanitized = cleanObject(payload, CONTACT_UPDATE_KEYS)
  if (!Object.keys(sanitized).length) {
    return NextResponse.json({ error: "payload_empty" }, { status: 400 })
  }

  const response = await callCrmApi(`/crm/contacts/${contactoId}`, {
    method: "PATCH",
    body: sanitized,
    withUserToken: true,
  })

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "contact_update_failed" },
      { status: response.status ?? 502 },
    )
  }

  return NextResponse.json(response.data)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ contactoId: string }> },
) {
  const { contactoId } = await params
  if (!contactoId) {
    return NextResponse.json({ error: "contacto_id_required" }, { status: 400 })
  }

  const response = await callCrmApi(`/crm/contacts/${contactoId}`, {
    method: "DELETE",
    withUserToken: true,
  })

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "contact_delete_failed" },
      { status: response.status ?? 502 },
    )
  }

  return NextResponse.json({ ok: true })
}
