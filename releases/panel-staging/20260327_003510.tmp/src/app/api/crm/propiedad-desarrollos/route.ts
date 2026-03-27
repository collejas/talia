"use server";

import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const response = await callCrmApi("/crm/propiedad-desarrollos", {
    method: "POST",
    body,
    withUserToken: true,
  });
  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 500 });
  }
  return NextResponse.json(response.data ?? []);
}
