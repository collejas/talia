import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

export async function GET(request: Request) {
  const canal = new URL(request.url).searchParams.get("canal") ?? ""
  const response = await callCrmApi(`/crm/prospeccion/plantillas/ai/variables?canal=${encodeURIComponent(canal)}`, {
    withUserToken: true,
  })
  if (!response.ok) return NextResponse.json({ error: response.error }, { status: response.status ?? 400 })
  return NextResponse.json(response.data)
}

export async function POST(request: Request) {
  const body = await request.json()
  const response = await callCrmApi("/crm/prospeccion/plantillas/ai/generate", {
    method: "POST",
    withUserToken: true,
    body,
  })
  if (!response.ok) return NextResponse.json({ error: response.error }, { status: response.status ?? 400 })
  return NextResponse.json(response.data, { status: 202 })
}
