"use server";

import { NextRequest, NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.search;
  const response = await callCrmApi(`/crm/inmobiliaria/contratos/plantillas${query}`, {
    method: "GET",
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "inmobiliaria_contract_templates_failed" },
      { status: response.status ?? 502 },
    );
  }

  return NextResponse.json(response.data ?? []);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const response = await callCrmApi("/crm/inmobiliaria/contratos/plantillas", {
    method: "POST",
    body,
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "inmobiliaria_contract_template_create_failed" },
      { status: response.status ?? 502 },
    );
  }

  return NextResponse.json(response.data ?? {}, { status: 201 });
}
