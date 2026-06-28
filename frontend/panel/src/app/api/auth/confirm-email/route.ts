"use server"

import { NextResponse } from "next/server"

import { getPanelApiBaseUrl } from "@/lib/api/panel"

export async function POST(request: Request) {
  try {
    const backendBase = getPanelApiBaseUrl()
    const targetUrl = new URL("/public/auth/confirm-email", backendBase)
    const rawBody = await request.text()
    const backendResponse = await fetch(targetUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": request.headers.get("content-type") || "application/json",
      },
      cache: "no-store",
      body: rawBody,
    })
    const responseText = await backendResponse.text()
    const contentType = backendResponse.headers.get("content-type") || "application/json"
    return new NextResponse(responseText || null, {
      status: backendResponse.status,
      headers: {
        "content-type": contentType,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "backend_unreachable"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
