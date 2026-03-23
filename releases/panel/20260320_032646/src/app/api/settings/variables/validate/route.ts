import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

type ValidationPayload = {
  scope?: "webchat" | "calendar" | "mail" | "twilio" | "messenger" | "full"
}

export async function POST(request: Request) {
  const body = (await request.json()) as ValidationPayload
  const response = await callCrmApi("/tenant/me/validate", {
    method: "POST",
    organizacionId: null,
    withUserToken: true,
    body: { scope: body.scope ?? "full" },
  })

  if (!response.ok) {
    return NextResponse.json({ error: response.error }, { status: response.status ?? 400 })
  }

  return NextResponse.json(response.data)
}
