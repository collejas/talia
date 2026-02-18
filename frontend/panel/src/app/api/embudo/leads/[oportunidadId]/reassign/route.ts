import { NextResponse } from "next/server";
import { callCrmApi } from "@/lib/api/crm";

type ReassignPayload = {
  asignado_usuario_id: string;
  contacto_id?: string | null;
  conversacion_id?: string | null;
  motivo?: string | null;
  alinear_contacto?: boolean;
  alinear_conversacion?: boolean;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ oportunidadId: string }> },
) {
  const { oportunidadId } = await params;
  if (!oportunidadId) {
    return NextResponse.json({ error: "oportunidad_id_required" }, { status: 400 });
  }

  let payload: ReassignPayload;
  try {
    payload = (await request.json()) as ReassignPayload;
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const response = await callCrmApi(`/crm/oportunidades/${oportunidadId}/reasignar`, {
    method: "POST",
    body: JSON.stringify(payload),
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
