"use server";

import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ oportunidadId: string }> },
) {
  const { oportunidadId } = await params;
  if (!oportunidadId) {
    return NextResponse.json({ error: "Falta oportunidadId." }, { status: 400 });
  }
  const contentType = request.headers.get("content-type") ?? "";
  let body: BodyInit;
  if (contentType.toLowerCase().includes("multipart/form-data")) {
    const formData = await request.formData();
    if (!formData.has("payload")) {
      return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
    }
    body = formData;
  } else {
    try {
      body = (await request.json()) as BodyInit;
    } catch {
      return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
    }
  }
  const response = await callCrmApi(`/crm/oportunidades/${oportunidadId}/property-proposals/send`, {
    method: "POST",
    body,
    withUserToken: true,
  });
  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "No se pudo enviar la propuesta inmobiliaria." },
      { status: response.status ?? 500 },
    );
  }
  return NextResponse.json(response.data ?? { ok: true });
}
