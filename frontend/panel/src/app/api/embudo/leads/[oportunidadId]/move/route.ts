import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";
import { resolveServerAccessToken } from "@/lib/auth/server-session";
import type { EmbudoCard, EmbudoStage, PipelineBoardCard, PipelineBoardStage } from "@/lib/embudo/data";
import { adaptCard, adaptStage, parseMetadatos } from "@/lib/embudo/helpers";

type PipelineCardResponse = {
  stage: PipelineBoardStage;
  card: PipelineBoardCard;
};

type MoveLeadPayload = {
  etapa_id?: string;
  motivo?: string | null;
  metadata?: Record<string, unknown>;
  fuente?: "humano" | "asistente" | "api";
  expected_etapa_id?: string | null;
};

type MoveLeadApiResult =
  | { ok: true; stage: EmbudoStage; card: EmbudoCard }
  | { ok: false; error: string; latestStage?: EmbudoStage; latestCard?: EmbudoCard };

function mapPipelineCardResponse(payload: PipelineCardResponse): { stage: EmbudoStage; card: EmbudoCard } {
  const stageMeta = parseMetadatos(payload.stage.metadatos);
  const stage = adaptStage(payload.stage, stageMeta);
  const card = adaptCard(payload.card);
  return {
    stage: {
      ...stage,
      tarjetas: [],
    },
    card,
  };
}

async function fetchLatestCard(oportunidadId: string): Promise<MoveLeadApiResult | null> {
  const latest = await callCrmApi<PipelineCardResponse>(`/crm/pipeline/cards/${oportunidadId}`, {
    withUserToken: true,
  });
  if (!latest.ok) {
    return null;
  }
  const mapped = mapPipelineCardResponse(latest.data);
  return { ok: true, stage: mapped.stage, card: mapped.card };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ oportunidadId: string }> },
) {
  const { oportunidadId } = await params;
  if (!oportunidadId) {
    return NextResponse.json({ ok: false, error: "oportunidad_id_required" }, { status: 400 });
  }

  let payload: MoveLeadPayload;
  try {
    payload = (await request.json()) as MoveLeadPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const body: Record<string, unknown> = {};
  if (typeof payload.etapa_id === "string" && payload.etapa_id.trim()) {
    body.etapa_id = payload.etapa_id.trim();
  }
  if (payload.motivo !== undefined) {
    body.motivo = payload.motivo;
  }
  if (payload.fuente) {
    body.fuente = payload.fuente;
  }
  if (payload.expected_etapa_id) {
    body.expected_etapa_id = payload.expected_etapa_id;
  }
  if (payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata)) {
    body.metadata = payload.metadata;
  }

  try {
    const freshAccessToken = await resolveServerAccessToken({ forceRefresh: true, minTtlSeconds: 0 });
    if (!freshAccessToken) {
      return NextResponse.json(
        { ok: false, error: "Tu sesión caducó. Vuelve a iniciar sesión." } satisfies MoveLeadApiResult,
        { status: 401 },
      );
    }

    const response = await callCrmApi<PipelineCardResponse>(`/crm/pipeline/opportunities/${oportunidadId}`, {
      method: "PATCH",
      body,
      withUserToken: true,
    });

    if (!response.ok) {
      if (response.status === 409) {
        const latest = await fetchLatestCard(oportunidadId);
        if (latest?.ok) {
          return NextResponse.json(
            {
              ok: false,
              error: response.error || "El lead cambió de etapa en otra sesión. Actualizamos la información.",
              latestStage: latest.stage,
              latestCard: latest.card,
            } satisfies MoveLeadApiResult,
            { status: 409 },
          );
        }
      }
      return NextResponse.json(
        { ok: false, error: response.error || "move_failed" } satisfies MoveLeadApiResult,
        { status: response.status ?? 502 },
      );
    }

    try {
      const mapped = mapPipelineCardResponse(response.data);
      return NextResponse.json({ ok: true, stage: mapped.stage, card: mapped.card } satisfies MoveLeadApiResult);
    } catch (mapError) {
      console.warn("/api/embudo/leads/[oportunidadId]/move parse-response-failed", {
        oportunidadId,
        error: mapError instanceof Error ? mapError.message : String(mapError),
      });
      const latest = await fetchLatestCard(oportunidadId);
      if (latest?.ok) {
        return NextResponse.json(latest satisfies MoveLeadApiResult);
      }
      return NextResponse.json(
        {
          ok: false,
          error: "No se pudo interpretar la respuesta del backend ni recuperar la oportunidad actual.",
        } satisfies MoveLeadApiResult,
        { status: 502 },
      );
    }
  } catch (error) {
    console.error("/api/embudo/leads/[oportunidadId]/move error", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "No se pudo mover el lead.",
      } satisfies MoveLeadApiResult,
      { status: 500 },
    );
  }
}
