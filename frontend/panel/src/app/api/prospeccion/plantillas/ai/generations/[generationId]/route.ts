import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

type Context = { params: Promise<{ generationId: string }> }

export async function GET(_request: Request, context: Context) {
  const { generationId } = await context.params
  const response = await callCrmApi(`/crm/prospeccion/plantillas/ai/generations/${encodeURIComponent(generationId)}`, {
    withUserToken: true,
  })
  if (!response.ok) return NextResponse.json({ error: response.error }, { status: response.status ?? 400 })
  return NextResponse.json(response.data)
}
