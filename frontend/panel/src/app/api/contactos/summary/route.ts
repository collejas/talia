import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";
import type { ContactCards } from "@/lib/contactos/types";

type ContactSummaryResponse = ContactCards;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const response = await callCrmApi<ContactSummaryResponse>("/crm/contacts/summary", {
    method: "GET",
    searchParams: buildSearchParams(url.searchParams),
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "contacts_summary_failed" },
      { status: response.status ?? 502 },
    );
  }

  return NextResponse.json(response.data);
}

function buildSearchParams(searchParams: URLSearchParams): Record<string, string> {
  const params: Record<string, string> = {};
  for (const key of [
    "search",
    "propietario",
    "origen",
    "from",
    "to",
    "puesto",
    "rol_decision",
    "estado_contacto",
    "captura",
    "ligado",
    "tipo_cuenta",
    "tamano",
    "clasificacion",
    "cuenta_from",
    "cuenta_to",
    "fecha_incorporacion_from",
    "fecha_incorporacion_to",
    "fusionada",
    "pais",
    "estado_direccion",
    "municipio",
  ]) {
    const value = searchParams.get(key)?.trim();
    if (value) params[key] = value;
  }
  return params;
}
