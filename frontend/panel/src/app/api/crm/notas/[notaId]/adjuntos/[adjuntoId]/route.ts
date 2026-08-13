import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

type RouteParams = { notaId: string; adjuntoId: string };

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<RouteParams> },
) {
  const { notaId, adjuntoId } = await params;
  const response = await callCrmApi(
    `/crm/notas/${encodeURIComponent(notaId)}/adjuntos/${encodeURIComponent(adjuntoId)}`,
    { method: "DELETE", withUserToken: true },
  );
  if (!response.ok) {
    return NextResponse.json({ error: response.error || "No se pudo eliminar el archivo." }, { status: response.status ?? 500 });
  }
  return new NextResponse(null, { status: 204 });
}
