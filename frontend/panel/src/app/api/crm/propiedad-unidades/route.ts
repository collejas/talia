"use server";

import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = new URLSearchParams();
  for (const key of ["query", "desarrollo_id", "limit"]) {
    const value = url.searchParams.get(key)?.trim();
    if (value) params.set(key, value);
  }
  const response = await callCrmApi(`/crm/propiedad-unidades?${params.toString()}`, {
    withUserToken: true,
  });
  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 500 });
  }
  return NextResponse.json(response.data ?? { units: [] });
}
