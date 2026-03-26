import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

export async function POST(request: Request) {
  const body = (await request.json()) as { canal?: string; clave?: string }
  const canal = (body.canal ?? "").trim().toLowerCase()
  const clave = (body.clave ?? "").trim().toLowerCase()
  if (!canal || !clave) {
    return NextResponse.json({ error: "Canal y clave son obligatorios." }, { status: 400 })
  }

  const response = await callCrmApi("/tenant/me/routes", {
    method: "POST",
    organizacionId: null,
    withUserToken: true,
    body: { canal, clave, metadata: {} },
  })

  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 400 })
  }

  return NextResponse.json(response.data)
}
