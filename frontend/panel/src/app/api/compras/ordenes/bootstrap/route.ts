import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

type ComprasOrdenesBootstrapResponse = {
  ok?: boolean
  almacenes?: unknown[]
  proveedores?: unknown[]
  catalog_items?: unknown[]
  incoterms?: unknown[]
  monedas?: unknown[]
  modos_transporte?: unknown[]
  paises?: unknown[]
  agentes_aduanales?: unknown[]
  pedimentos_importacion?: unknown[]
}

export async function GET() {
  const response = await callCrmApi<ComprasOrdenesBootstrapResponse>("/crm/compras/ordenes/bootstrap", {
    withUserToken: true,
  })

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error ?? "ordenes_bootstrap_unavailable" },
      { status: response.status ?? 502 },
    )
  }

  return NextResponse.json(response.data ?? { ok: true })
}
