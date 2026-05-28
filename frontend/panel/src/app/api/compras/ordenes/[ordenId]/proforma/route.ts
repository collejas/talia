import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

type SignedUrlResponse = {
  url: string
  expires_in?: number
}

export async function GET(_request: Request, context: { params: Promise<{ ordenId: string }> }) {
  const { ordenId } = await context.params
  const response = await callCrmApi<SignedUrlResponse>(`/crm/compras/ordenes/${ordenId}/proforma-url`)
  if (!response.ok) {
    return NextResponse.json(
      { error: response.error ?? "orden_proforma_not_found" },
      { status: response.status ?? 404 },
    )
  }

  if (!response.data?.url) {
    return NextResponse.json({ error: "orden_proforma_not_found" }, { status: 404 })
  }

  return NextResponse.redirect(response.data.url, 307)
}

export async function POST(request: Request, context: { params: Promise<{ ordenId: string }> }) {
  const { ordenId } = await context.params
  const formData = await request.formData()
  const file = formData.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file_required" }, { status: 400 })
  }

  const payload = new FormData()
  payload.append("file", file, file.name || "documento.pdf")

  const response = await callCrmApi(`/crm/compras/ordenes/${ordenId}/proforma`, {
    method: "POST",
    body: payload,
  })
  if (!response.ok) {
    return NextResponse.json(
      { error: response.error ?? "proforma_upload_failed" },
      { status: response.status ?? 500 },
    )
  }
  return NextResponse.json(response.data ?? { ok: true })
}
