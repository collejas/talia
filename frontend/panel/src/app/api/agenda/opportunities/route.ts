import { NextResponse } from "next/server"

import type { NextRequest } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

type OpportunityRow = {
  id: string
  contacto_principal_id: string | null
  etapa_id: string
  titulo: string
  estado: string
}

type OpportunitiesResponse = {
  items: OpportunityRow[]
  limit: number
  offset: number
}

type StageRow = {
  id: string
  codigo?: string | null
  categoria?: string | null
  orden?: number | null
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const personaId = (searchParams.get("persona_id") || "").trim()

  if (!personaId) {
    return NextResponse.json({ error: "persona_id_required" }, { status: 400 })
  }

  const response = await callCrmApi<OpportunitiesResponse>("/crm/oportunidades", {
    method: "GET",
    searchParams: {
      persona_id: personaId,
      estado: "abierta",
      limit: 20,
      offset: 0,
    },
    withUserToken: true,
  })

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "opportunities_list_failed" },
      { status: response.status ?? 502 },
    )
  }

  return NextResponse.json(response.data)
}

export async function POST(request: NextRequest) {
  let payload: { persona_id?: string; contacto_id?: string; titulo?: string }
  try {
    payload = (await request.json()) as { persona_id?: string; contacto_id?: string; titulo?: string }
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const personaId = payload.persona_id?.trim() || payload.contacto_id?.trim()
  const titulo = payload.titulo?.trim()

  if (!personaId) {
    return NextResponse.json({ error: "persona_id_required" }, { status: 400 })
  }
  if (!titulo) {
    return NextResponse.json({ error: "titulo_required" }, { status: 400 })
  }

  const stagesResponse = await callCrmApi<StageRow[]>("/crm/etapas", {
    method: "GET",
    withUserToken: true,
  })

  if (!stagesResponse.ok) {
    return NextResponse.json(
      { error: stagesResponse.error || "stages_list_failed" },
      { status: stagesResponse.status ?? 502 },
    )
  }

  const stages = Array.isArray(stagesResponse.data) ? stagesResponse.data : []
  if (!stages.length) {
    return NextResponse.json({ error: "pipeline_stage_missing" }, { status: 400 })
  }

  const byOrder = [...stages].sort((a, b) => (a.orden ?? 9999) - (b.orden ?? 9999))
  const selectedStage =
    byOrder.find((item) => (item.codigo || "").toLowerCase() === "prospeccion_primer_contacto") ||
    byOrder.find((item) => (item.categoria || "").toLowerCase() === "abierta") ||
    byOrder[0]

  if (!selectedStage?.id) {
    return NextResponse.json({ error: "pipeline_stage_missing" }, { status: 400 })
  }

  const createResponse = await callCrmApi<OpportunityRow>("/crm/oportunidades", {
    method: "POST",
    body: {
      contacto_principal_id: personaId,
      etapa_id: selectedStage.id,
      titulo,
      estado: "abierta",
      metadata: {
        source: "agenda_manual",
      },
    },
    withUserToken: true,
  })

  if (!createResponse.ok) {
    return NextResponse.json(
      { error: createResponse.error || "opportunity_create_failed" },
      { status: createResponse.status ?? 502 },
    )
  }

  return NextResponse.json(createResponse.data, { status: 201 })
}
