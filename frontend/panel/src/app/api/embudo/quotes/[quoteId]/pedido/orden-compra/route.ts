"use server";

import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

type RouteContext = {
  params: Promise<{ quoteId: string }>;
};

type UploadResponse = {
  id: string;
  tipo_documento: string;
  nombre_original: string;
  content_type: string | null;
  tamano_bytes: number | null;
};

type SignedUrlResponse = {
  url: string;
};

export async function POST(request: Request, context: RouteContext) {
  const { quoteId } = await context.params;
  if (!quoteId) return NextResponse.json({ error: "Falta quoteId." }, { status: 400 });

  const incoming = await request.formData().catch(() => null);
  const file = incoming?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Selecciona el PDF de la orden de compra." }, { status: 400 });
  }

  const payload = new FormData();
  payload.append("file", file, file.name || "orden-compra.pdf");
  const response = await callCrmApi<UploadResponse>(
    `/crm/cotizaciones/${quoteId}/pedido/orden-compra`,
    { method: "POST", body: payload, withUserToken: true },
  );
  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "No se pudo adjuntar la orden de compra." },
      { status: response.status ?? 500 },
    );
  }
  return NextResponse.json(response.data);
}

export async function GET(_request: Request, context: RouteContext) {
  const { quoteId } = await context.params;
  const url = new URL(_request.url);
  const documentoId = url.searchParams.get("documento_id");
  if (!quoteId || !documentoId) {
    return NextResponse.json({ error: "Falta la referencia del documento." }, { status: 400 });
  }
  const response = await callCrmApi<SignedUrlResponse>(
    `/crm/cotizaciones/${quoteId}/pedido/orden-compra/${documentoId}/url`,
    { withUserToken: true },
  );
  if (!response.ok || !response.data?.url) {
    return NextResponse.json(
      { error: response.ok ? "No se encontró el documento." : response.error },
      { status: response.ok ? 404 : response.status ?? 500 },
    );
  }
  return NextResponse.redirect(response.data.url, 307);
}
