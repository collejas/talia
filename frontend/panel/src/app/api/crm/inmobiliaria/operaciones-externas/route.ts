import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

export async function POST(request: Request) {
  const response = await callCrmApi("/crm/inmobiliaria/operaciones-externas", {
    method: "POST",
    body: await request.json().catch(() => ({})),
    withUserToken: true,
  })
  if (!response.ok) return NextResponse.json({ error: response.error }, { status: response.status ?? 502 })
  return NextResponse.json(response.data ?? {}, { status: 201 })
}
