"use server";

import { NextRequest, NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ unidadId: string }> },
) {
  const { unidadId } = await params;
  const body = await request.json().catch(() => ({}));
  const response = await callCrmApi(`/crm/propiedad-unidades/${unidadId}`, {
    method: "PATCH",
    body,
    withUserToken: true,
  });
  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 500 });
  }
  return NextResponse.json(response.data ?? {});
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ unidadId: string }> },
) {
  const { unidadId } = await params;
  const response = await callCrmApi(`/crm/propiedad-unidades/${unidadId}`, {
    method: "DELETE",
    withUserToken: true,
  });
  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 500 });
  }
  return NextResponse.json(response.data ?? {});
}
