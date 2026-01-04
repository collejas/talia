import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

function buildErrorResponse(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(request: Request) {
  const formData = await request.formData()
  const file = formData.get("file")
  if (!(file instanceof File)) {
    return buildErrorResponse("file_required", 400)
  }

  const payload = new FormData()
  payload.append("file", file, file.name || "media.png")

  const response = await callCrmApi<{ url: string; path: string; bucket: string }>(
    "/crm/settings/media/upload",
    {
      method: "POST",
      body: payload,
    },
  )

  if (!response.ok) {
    return buildErrorResponse(response.error ?? "upload_failed", response.status ?? 500)
  }

  return NextResponse.json(response.data ?? {})
}
