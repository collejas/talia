import { NextResponse } from "next/server"

import type { NextRequest } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

type ContactCreatePayload = {
  nombre_completo?: string
  telefono_e164?: string
  correo?: string
  company_name?: string
  origen?: string
}

type ContactCreateResponse = {
  id: string
  nombre_completo: string | null
  correo: string | null
  telefono_e164: string | null
  company_name: string | null
}

export async function POST(request: NextRequest) {
  let payload: ContactCreatePayload
  try {
    payload = (await request.json()) as ContactCreatePayload
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  if (!payload?.nombre_completo?.trim()) {
    return NextResponse.json({ error: "nombre_completo_required" }, { status: 400 })
  }

  const body: ContactCreatePayload = {
    nombre_completo: payload.nombre_completo.trim(),
    telefono_e164: payload.telefono_e164?.trim() || undefined,
    correo: payload.correo?.trim() || undefined,
    company_name: payload.company_name?.trim() || undefined,
    origen: payload.origen?.trim() || "agenda_manual",
  }

  const response = await callCrmApi<ContactCreateResponse>("/crm/contacts", {
    method: "POST",
    body,
    withUserToken: true,
  })

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "contact_create_failed" },
      { status: response.status ?? 502 },
    )
  }

  return NextResponse.json(response.data, { status: 201 })
}

