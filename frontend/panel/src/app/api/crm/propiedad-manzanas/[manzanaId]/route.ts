"use server";

import { NextRequest, NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ manzanaId: string }> },
) {
  const { manzanaId } = await params;
  const body = await request.json().catch(() => ({}));
  const response = await callCrmApi(`/crm/propiedad-manzanas/${manzanaId}`, {
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
  _request: NextRequest,
  { params }: { params: Promise<{ manzanaId: string }> },
) {
  const { manzanaId } = await params;
  const response = await callCrmApi(`/crm/propiedad-manzanas/${manzanaId}`, {
    method: "DELETE",
    withUserToken: true,
  });
  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 500 });
  }
  return NextResponse.json(response.data ?? {});
}
