import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

export async function POST(request: Request) {
  let payload: unknown
  try { payload = await request.json() } catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }) }
  const response = await callCrmApi("/crm/personas/importar", { method: "POST", body: payload, withUserToken: true })
  if (!response.ok) return NextResponse.json({ error: response.error || "contact_import_failed" }, { status: response.status ?? 502 })
  return NextResponse.json(response.data)
}
