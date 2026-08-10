import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ logoId: string }> },
) {
  const { logoId } = await params
  const response = await callCrmApi(`/crm/settings/logos/${encodeURIComponent(logoId)}`, {
    method: "DELETE",
  })

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error },
      { status: response.status ?? 500 },
    )
  }

  return new NextResponse(null, { status: 204 })
}
