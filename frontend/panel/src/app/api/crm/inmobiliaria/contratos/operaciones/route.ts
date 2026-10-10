"use server";

import { NextRequest, NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const response = await callCrmApi("/crm/inmobiliaria/contratos/operaciones", {
    method: "POST",
    body: formData,
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "property_contract_save_failed" },
      { status: response.status ?? 502 },
    );
  }

  return NextResponse.json(response.data ?? {}, { status: 201 });
}
