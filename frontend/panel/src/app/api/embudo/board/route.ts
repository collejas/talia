import { NextResponse } from "next/server"
import { loadEmbudoData } from "@/lib/embudo/data"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const limitParam = Number(url.searchParams.get("limit"))
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined
  const asignadoId = url.searchParams.get("asignado_id")
  try {
    const data = await loadEmbudoData({
      limit,
      asignadoId: asignadoId || undefined,
    })
    return NextResponse.json(data)
  } catch (error) {
    console.error("/api/embudo/board error", error)
    return NextResponse.json(
      { stages: [], sinConversacion: [], visitantesSinChat: 0, scoringKpis: null, errors: ["board_fetch_failed"] },
      { status: 502 },
    )
  }
}
