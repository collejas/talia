import { NextResponse } from "next/server"
import { loadEmbudoData } from "@/lib/embudo/data"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const limitParam = Number(url.searchParams.get("limit"))
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined
  const asignadoId = url.searchParams.get("asignado_id")
  const canal = url.searchParams.get("canal")
  const estado = url.searchParams.get("estado")
  const correo = url.searchParams.get("correo")
  const q = url.searchParams.get("q")
  const etapaIdsRaw = url.searchParams.get("etapa_ids")
  const etapaIds = etapaIdsRaw ? etapaIdsRaw.split(",").map((value) => value.trim()).filter(Boolean) : []
  const tieneCita = url.searchParams.get("tiene_cita")
  const daysParam = Number(url.searchParams.get("days"))
  const days = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : undefined
  try {
    const data = await loadEmbudoData({
      limit,
      asignadoId: asignadoId || undefined,
      canal: canal || undefined,
      estado: estado || undefined,
      correo: correo || undefined,
      q: q || undefined,
      etapaIds,
      tieneCita: tieneCita || undefined,
      days,
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
