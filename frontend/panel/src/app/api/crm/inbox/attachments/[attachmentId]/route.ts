import { NextRequest, NextResponse } from "next/server"

import { proxyAttachmentRequest } from "../proxy"

type RouteContext = {
  params: Promise<{ attachmentId: string }>
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const params = await context.params
  const attachmentId = typeof params?.attachmentId === "string" ? params.attachmentId.trim() : ""
  if (!attachmentId) {
    return NextResponse.json({ error: "attachment_required" }, { status: 400 })
  }
  return proxyAttachmentRequest({ attachmentId })
}
