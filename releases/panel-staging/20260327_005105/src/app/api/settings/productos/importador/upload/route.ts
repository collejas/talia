import { NextRequest, NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

export async function POST(request: NextRequest) {
  const formData = await request.formData().catch(() => null)
  if (!formData) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 })
  }

  const schemeId = formData.get("scheme_id")
  if (!schemeId || typeof schemeId !== "string") {
    return NextResponse.json({ error: "scheme_id_required" }, { status: 400 })
  }

  const file = formData.get("file")
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "file_required" }, { status: 400 })
  }

  const upload = new FormData()
  upload.append("scheme_id", schemeId)
  upload.append("file", file as File, (file as File).name || "import.csv")

  const response = await callCrmApi("/crm/productos/importador/import", {
    method: "POST",
    body: upload,
    withUserToken: true,
  })

  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 502 })
  }

  return NextResponse.json(response.data ?? {})
}
