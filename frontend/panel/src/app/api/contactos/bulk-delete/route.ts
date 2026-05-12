import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

type BulkDeletePayload = {
  ids?: string[]
}

export async function POST(request: Request) {
  let payload: BulkDeletePayload
  try {
    payload = (await request.json()) as BulkDeletePayload
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const ids = Array.isArray(payload.ids) ? payload.ids.map((value) => String(value).trim()).filter(Boolean) : []
  if (!ids.length) {
    return NextResponse.json({ error: "ids_required" }, { status: 400 })
  }

  const response = await callCrmApi("/crm/contacts/bulk-delete", {
    method: "POST",
    body: { ids },
    withUserToken: true,
  })

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "bulk_delete_failed" },
      { status: response.status ?? 502 },
    )
  }

  return NextResponse.json(response.data ?? { ok: true })
}
