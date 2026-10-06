"use server";

import { NextResponse } from "next/server";
import { callCrmApi } from "@/lib/api/crm";

export async function POST(_request: Request, { params }: { params: Promise<{ entregaId: string }> }) {
  const { entregaId } = await params;
  const response = await callCrmApi(`/crm/entregas/${entregaId}/confirmar`, { method: "POST", body: {}, withUserToken: true });
  return response.ok ? NextResponse.json(response.data ?? { ok: true }) : NextResponse.json({ error: response.error || "No se pudo confirmar la entrega." }, { status: response.status ?? 500 });
}
