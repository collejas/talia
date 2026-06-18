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
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
    }
    body = payload as BodyInit;
  }

  const response = await callCrmApi(`/crm/oportunidades/${oportunidadId}/quotes/send`, {
    method: "POST",
    body,
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "No se pudo enviar la cotización." },
      { status: response.status ?? 500 },
    );
  }

  return NextResponse.json(response.data ?? { ok: true });
}
