import { NextResponse } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

export async function POST(request: Request) {
  const formData = await request.formData()
  const response = await callCrmApi("/crm/inmobiliaria/pagos/operaciones", {
    method: "POST",
    body: formData,
    withUserToken: true,
  })

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "property_payment_save_failed" },
      { status: response.status ?? 502 },
    )
  }
  return NextResponse.json(response.data, { status: 201 })
}
