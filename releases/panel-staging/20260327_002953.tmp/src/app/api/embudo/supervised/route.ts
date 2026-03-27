import { NextResponse } from "next/server"
import { callCrmApi } from "@/lib/api/crm"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const limitParam = Number(url.searchParams.get("limit"))
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 200

  const response = await callCrmApi("/crm/usuarios/supervisados", {
    searchParams: {
      limit: String(limit),
    },
    withUserToken: true,
  })

  if (!response.ok) {
    return NextResponse.json({ error: response.error ?? "supervised_fetch_failed" }, { status: response.status ?? 502 })
  }

  return NextResponse.json({ vendedores: response.data ?? [] })
}
