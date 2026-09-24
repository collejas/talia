"use server";

import { NextResponse } from "next/server";
import { callCrmApi } from "@/lib/api/crm";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ quoteId: string }> },
) {
  const { quoteId } = await params;
  if (!quoteId) return NextResponse.json({ error: "Falta quoteId." }, { status: 400 });
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "La evidencia no es válida." }, { status: 400 });
  const payload = new FormData();
  for (const key of ["tipo_evidencia", "referencia", "observaciones", "file"]) {
    const value = form.get(key);
    if (value instanceof File) payload.append(key, value, value.name);
    else if (typeof value === "string" && value) payload.append(key, value);
  }
  const response = await callCrmApi(
    `/crm/cotizaciones/${quoteId}/pedido/evidencias`,
    { method: "POST", body: payload, withUserToken: true },
  );
  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "No se pudo guardar la evidencia." },
      { status: response.status ?? 500 },
    );
  }
  return NextResponse.json(response.data, { status: 201 });
}
