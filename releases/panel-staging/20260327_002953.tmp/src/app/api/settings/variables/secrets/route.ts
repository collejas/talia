import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

type SecretPayload = {
  clave: string
  valor: string
  tier?: "A" | "B"
  etiqueta?: string
}

export async function POST(request: Request) {
  const body = (await request.json()) as { secrets?: SecretPayload[] }
  const secrets = Array.isArray(body.secrets) ? body.secrets : undefined
  if (!secrets?.length) {
    return NextResponse.json({ error: "No se aportaron secretos." }, { status: 400 })
  }

  const response = await callCrmApi<{ ok: boolean; items: unknown[] }>("/tenant/me/secrets", {
    method: "POST",
    organizacionId: null,
    withUserToken: true,
    body: { secrets },
  })

  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 400 })
  }

  return NextResponse.json({ ok: true, secrets: response.data.items })
}
