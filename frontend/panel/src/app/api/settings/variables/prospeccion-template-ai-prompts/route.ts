import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

export async function GET() {
  const response = await callCrmApi("/tenant/me/prospeccion-template-ai-prompts", {
    organizacionId: null,
    withUserToken: true,
  })
  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 400 })
  }
  return NextResponse.json(response.data)
}

export async function PUT(request: Request) {
  const body = await request.json()
  const canal = body?.canal
  if (canal !== "whatsapp" && canal !== "correo") {
    return NextResponse.json({ error: "Canal inválido." }, { status: 400 })
  }
  const response = await callCrmApi(`/tenant/me/prospeccion-template-ai-prompts/${canal}`, {
    method: "PUT",
    organizacionId: null,
    withUserToken: true,
    body: {
      prompt_id: body?.prompt_id,
      prompt_version: body?.prompt_version,
      activo: body?.activo,
    },
  })
  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 400 })
  }
  return NextResponse.json(response.data)
}
