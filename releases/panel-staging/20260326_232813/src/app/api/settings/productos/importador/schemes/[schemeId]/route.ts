import { NextRequest, NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

function resolveSchemeId(request: NextRequest, schemeId?: string) {
  if (schemeId) {
    return schemeId
  }
  const url = new URL(request.url)
  const segments = url.pathname.split("/").filter(Boolean)
  return segments.at(-1) ?? null
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ schemeId: string }> },
) {
  const payload = await request.json().catch(() => null)
  if (!payload) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
  }
  const resolvedParams = await params
  const schemeId = resolveSchemeId(request, resolvedParams?.schemeId)
  if (!schemeId) {
    return NextResponse.json({ error: "scheme_id_required" }, { status: 400 })
  }
  const response = await callCrmApi(`/crm/productos/importador/schemes/${schemeId}`, {
    method: "PATCH",
    body: payload,
  })
  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 502 })
  }
  return NextResponse.json(response.data ?? {})
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ schemeId: string }> },
) {
  const resolvedParams = await params
  const schemeId = resolveSchemeId(request, resolvedParams?.schemeId)
  if (!schemeId) {
    return NextResponse.json({ error: "scheme_id_required" }, { status: 400 })
  }
  const response = await callCrmApi(`/crm/productos/importador/schemes/${schemeId}`, {
    method: "DELETE",
  })
  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 502 })
  }
  return NextResponse.json({}, { status: 204 })
}
