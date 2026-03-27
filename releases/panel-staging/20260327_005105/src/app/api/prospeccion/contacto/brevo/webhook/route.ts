import { NextResponse } from "next/server"

import { getPanelApiBaseUrl } from "@/lib/api/panel"

function buildWebhookTarget(): URL {
  const backendBase = getPanelApiBaseUrl()
  return new URL(`${backendBase}/crm/prospeccion/contacto/brevo/webhook`)
}

export async function POST(request: Request) {
  let targetUrl: URL
  try {
    targetUrl = buildWebhookTarget()
  } catch (error) {
    const message = error instanceof Error ? error.message : "backend_not_configured"
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const rawBody = await request.text()

  let backendResponse: Response
  try {
    backendResponse = await fetch(targetUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": request.headers.get("content-type") || "application/json",
      },
      cache: "no-store",
      body: rawBody,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "backend_unreachable"
    return NextResponse.json({ error: message }, { status: 502 })
  }

  const responseText = await backendResponse.text()
  const contentType = backendResponse.headers.get("content-type") || "application/json"

  return new NextResponse(responseText || null, {
    status: backendResponse.status,
    headers: {
      "content-type": contentType,
    },
  })
}
