import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function POST(
  request: Request,
  context: { params: Promise<{ oportunidadId: string }> },
) {
  const { oportunidadId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const response = await callCrmApi(`/crm/oportunidades/${oportunidadId}/property-unit-change`, {
    method: "POST",
    body,
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "property_unit_change_failed" },
      { status: response.status ?? 502 },
    );
  }

  return NextResponse.json(response.data);
}
