import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "payload_invalid_json" },
      { status: 400 },
    );
  }

  const response = await callCrmApi("/crm/propiedades", {
    method: "POST",
    body: payload,
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error ?? "propiedad_creation_failed" },
      { status: response.status ?? 500 },
    );
  }

  return NextResponse.json(response.data ?? {});
}
