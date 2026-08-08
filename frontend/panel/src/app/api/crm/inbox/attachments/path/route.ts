import { NextRequest, NextResponse } from "next/server"

import { proxyAttachmentRequest } from "../proxy"

export async function GET(request: NextRequest) {
  const path = new URL(request.url).searchParams.get("path")?.trim() ?? ""
  if (!path) {
    return NextResponse.json({ error: "attachment_path_required" }, { status: 400 })
  }
  return proxyAttachmentRequest({ path })
}
