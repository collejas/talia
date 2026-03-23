"use server";

import { NextRequest, NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const response = await callCrmApi("/crm/propiedad-poligonos", {
    method: "POST",
    body,
    withUserToken: true,
  });
  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 500 });
  }
  return NextResponse.json(response.data ?? {});
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const targetType = url.searchParams.get("target_type");
  const targetId = url.searchParams.get("target_id");
  if (!targetType || !targetId) {
    return NextResponse.json(
      { error: "target_type and target_id are required" },
      { status: 400 },
    );
  }
  const response = await callCrmApi("/crm/propiedad-poligonos", {
    searchParams: {
      target_type: targetType,
      target_id: targetId,
    },
  });
  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 500 });
  }
  return NextResponse.json(response.data ?? {});
}
