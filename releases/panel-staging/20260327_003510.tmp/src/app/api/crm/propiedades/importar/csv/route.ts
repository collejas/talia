"use server";

import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Debes adjuntar un archivo CSV." }, { status: 400 });
  }
  const formData = new FormData();
  formData.append("file", file);
  const response = await callCrmApi("/crm/propiedades/importar/csv", {
    method: "POST",
    body: formData,
    withUserToken: true,
  });
  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 500 });
  }
  return NextResponse.json(response.data ?? []);
}
