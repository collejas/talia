import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

const buildError = (message: string, status = 500) =>
  NextResponse.json({ error: message }, { status });

export async function GET() {
  const response = await callCrmApi("/rest/v1/propiedad_tipos", {
    searchParams: { select: "id,nombre,color", order: "nombre.asc" },
  });
  if (!response.ok) {
    return buildError(response.error, response.status ?? 500);
  }
  return NextResponse.json(response.data ?? []);
}
