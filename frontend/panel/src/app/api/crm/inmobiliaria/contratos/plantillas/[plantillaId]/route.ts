"use server";

import { NextRequest, NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ plantillaId: string }> },
) {
  const { plantillaId } = await params;
  const body = await request.json().catch(() => ({}));
  const response = await callCrmApi(`/crm/inmobiliaria/contratos/plantillas/${plantillaId}`, {
    method: "PATCH",
    body,
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "inmobiliaria_contract_template_update_failed" },
      { status: response.status ?? 502 },
    );
  }

  return NextResponse.json(response.data ?? {});
}
