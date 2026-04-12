import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

type UnknownRecord = Record<string, unknown>;

export async function POST(request: NextRequest) {
  let payload: UnknownRecord;
  try {
    payload = (await request.json()) as UnknownRecord;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const response = await callCrmApi<UnknownRecord>("/crm/personas/alta", {
    method: "POST",
    body: payload,
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "persona_alta_failed" },
      { status: response.status ?? 502 },
    );
  }

  return NextResponse.json(response.data);
}
