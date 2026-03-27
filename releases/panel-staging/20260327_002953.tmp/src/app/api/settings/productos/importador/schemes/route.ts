import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

export async function GET() {
  const response = await callCrmApi("/crm/productos/importador/schemes")
  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 502 })
  }
  return NextResponse.json(response.data ?? [])
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null)
  if (!payload) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
  }
  const response = await callCrmApi("/crm/productos/importador/schemes", {
    method: "POST",
    body: payload,
  })
  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 502 })
  }
  return NextResponse.json(response.data ?? {}, { status: 201 })
}
