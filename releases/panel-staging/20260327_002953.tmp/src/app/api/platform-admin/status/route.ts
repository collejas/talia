import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

export async function GET() {
  const response = await callCrmApi<{ is_platform_admin: boolean }>("/admin/me/platform-admin", {
    method: "GET",
    organizacionId: null,
    withUserToken: true,
  })

  if (!response.ok) {
    return NextResponse.json({ is_platform_admin: false })
  }

  return NextResponse.json({ is_platform_admin: response.data.is_platform_admin })
}
