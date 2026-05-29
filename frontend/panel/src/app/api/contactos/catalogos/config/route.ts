import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

export async function GET() {
  const response = await callCrmApi("/tenant/me/contactos/catalogos", {
    withUserToken: true,
  })

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error ?? "contact_catalogs_fetch_failed" },
      { status: response.status ?? 502 },
    )
  }

  return NextResponse.json(response.data)
}
