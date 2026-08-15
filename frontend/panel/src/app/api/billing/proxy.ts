import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

const ALLOWED_QUERY_PARAMS = [
  "desde",
  "hasta",
  "periodo_id",
  "categoria_meta",
  "direccion",
  "page",
  "page_size",
  "organizacion_id",
] as const

export async function proxyBillingRequest(request: Request, backendPath: string, responseType: "json" | "text" = "json") {
  const sourceUrl = new URL(request.url)
  const searchParams: Record<string, string> = {}
  for (const key of ALLOWED_QUERY_PARAMS) {
    const value = sourceUrl.searchParams.get(key)?.trim()
    if (value) searchParams[key] = value
  }

  let body: unknown = undefined
  if (request.method !== "GET") {
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "request_body_invalid" }, { status: 400 })
    }
  }

  const response = await callCrmApi<Record<string, unknown>>(backendPath, {
    method: request.method as "GET" | "POST",
    body,
    searchParams,
    organizacionId: null,
    withUserToken: true,
    responseType,
  })
  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "billing_request_failed" },
      { status: response.status ?? 500 },
    )
  }
  if (responseType === "text") {
    return new NextResponse(String(response.data ?? ""), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="cobro-mensajes.csv"',
      },
    })
  }
  return NextResponse.json(response.data ?? { ok: true })
}
