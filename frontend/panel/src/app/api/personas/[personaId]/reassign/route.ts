import { NextResponse } from "next/server";
import { callCrmApi } from "@/lib/api/crm";

type ReassignPayload = {
  propietario_usuario_id: string;
  oportunidad_id?: string | null;
  conversacion_id?: string | null;
  motivo?: string | null;
  alinear_oportunidad?: boolean;
  alinear_conversacion?: boolean;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ personaId: string }> },
) {
  const { personaId } = await params;
  if (!personaId) {
    return NextResponse.json({ error: "missing_persona_id" }, { status: 400 });
  }

  let payload: ReassignPayload;
  try {
    payload = (await request.json()) as ReassignPayload;
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const response = await callCrmApi(`/crm/personas/${personaId}/reasignar`, {
    method: "POST",
    body: payload,
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error ?? "reassign_failed" },
      { status: response.status ?? 502 },
    );
  }

  return NextResponse.json(response.data ?? { ok: true });
}
