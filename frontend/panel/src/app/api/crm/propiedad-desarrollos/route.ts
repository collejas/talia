"use server";

import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const response = await callCrmApi("/rest/v1/propiedad_desarrollos", {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
  });
  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 500 });
  }
  return NextResponse.json(response.data ?? []);
}
