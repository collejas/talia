import { NextRequest, NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ desarrolloId: string }> },
) {
  const { desarrolloId } = await params;
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "payload_invalid_json" }, { status: 400 });
  }
  const response = await callCrmApi(`/crm/propiedad-desarrollos/${desarrolloId}`, {
    method: "PATCH",
    body: payload,
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 500 });
  }
  return NextResponse.json(response.data ?? {});
}
