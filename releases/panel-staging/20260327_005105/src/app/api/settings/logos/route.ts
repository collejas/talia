import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

function buildErrorResponse(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET() {
  const response = await callCrmApi<{ logos: unknown[] }>("/crm/settings/logos")
  if (!response.ok) {
    return NextResponse.json(
      { error: response.error },
      { status: response.status ?? 500 },
    )
  }
  return NextResponse.json(response.data ?? { logos: [] })
}

export async function POST(request: Request) {
  const formData = await request.formData()
  const file = formData.get("file")
  if (!(file instanceof File)) {
    return buildErrorResponse("file_required", 400)
  }

  const payload = new FormData()
  payload.append("file", file, file.name || "logo.png")
  const nombre = formData.get("nombre")
  const resolvedName =
    typeof nombre === "string" && nombre.trim().length ? nombre.trim() : file.name || "Logo"
  payload.append("nombre", resolvedName)
  const descripcion = formData.get("descripcion")
  if (typeof descripcion === "string" && descripcion.trim().length) {
    payload.append("descripcion", descripcion.trim())
  }

  const response = await callCrmApi("/crm/settings/logos", {
    method: "POST",
    body: payload,
  })

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error },
      { status: response.status ?? 500 },
    )
  }

  return NextResponse.json(response.data ?? { ok: true })
}
