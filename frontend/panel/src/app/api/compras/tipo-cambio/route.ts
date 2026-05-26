import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

type BanxicoTipoCambioResponse = {
  moneda: string
  tipo_cambio: number
  serie: string
  descripcion?: string | null
  fecha?: string | null
  fuente: string
  fuente_url?: string | null
  actualizado_en: string
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const moneda = (searchParams.get("moneda") ?? "USD").trim().toUpperCase()

  const response = await callCrmApi<BanxicoTipoCambioResponse>("/crm/compras/tipo-cambio", {
    searchParams: { moneda },
    withUserToken: true,
  })

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error ?? "tipo_cambio_unavailable" },
      { status: response.status ?? 502 },
    )
  }

  return NextResponse.json(response.data)
}
