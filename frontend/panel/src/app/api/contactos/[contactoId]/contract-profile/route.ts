import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ contactoId: string }> },
) {
  const { contactoId } = await params;
  if (!contactoId) return NextResponse.json({ error: "contacto_id_required" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const response = await callCrmApi(`/crm/contacts/${encodeURIComponent(contactoId)}/contract-profile`, {
    method: "PATCH",
    body,
    withUserToken: true,
  });
  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "buyer_contract_profile_update_failed" },
      { status: response.status ?? 502 },
    );
  }
  return NextResponse.json(response.data);
}
