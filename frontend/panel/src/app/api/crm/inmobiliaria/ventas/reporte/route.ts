import { NextRequest, NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

export async function GET(request: NextRequest) {
  const response = await callCrmApi(`/crm/inmobiliaria/ventas/reporte${request.nextUrl.search}`, { withUserToken: true })
  if (!response.ok) return NextResponse.json({ error: response.error }, { status: response.status ?? 502 })
  return NextResponse.json(response.data ?? { resumen: {}, serie: [], por_estado: [], por_origen: [], por_desarrollo: [], items: [] })
}
