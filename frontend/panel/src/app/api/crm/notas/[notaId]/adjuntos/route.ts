import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

type RouteParams = { notaId: string };

export async function GET(
  _request: Request,
  { params }: { params: Promise<RouteParams> },
) {
  const { notaId } = await params;
  const response = await callCrmApi(`/crm/notas/${encodeURIComponent(notaId)}/adjuntos`, {
    searchParams: { limit: "20" },
    withUserToken: true,
  });
  if (!response.ok) {
    return NextResponse.json({ error: response.error || "No se pudieron cargar los archivos." }, { status: response.status ?? 500 });
  }
  return NextResponse.json({ data: response.data });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<RouteParams> },
) {
  const { notaId } = await params;
  const incoming = await request.formData();
  const file = incoming.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file_required" }, { status: 400 });
  }

  const formData = new FormData();
  formData.append("file", file, file.name);
  const response = await callCrmApi(`/crm/notas/${encodeURIComponent(notaId)}/adjuntos`, {
    method: "POST",
    body: formData,
    withUserToken: true,
  });
  if (!response.ok) {
    return NextResponse.json({ error: response.error || "No se pudo subir el archivo." }, { status: response.status ?? 500 });
  }
  return NextResponse.json({ data: response.data }, { status: 201 });
}
