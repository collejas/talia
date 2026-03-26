import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function GET() {
  const response = await callCrmApi("/crm/propiedades/tipos", {
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 500 });
  }

  return NextResponse.json(response.data ?? []);
}
