import { NextResponse } from "next/server"

import type { NextRequest } from "next/server"

import { callCrmApi } from "@/lib/api/crm"

type ContactSearchItem = {
  id: string
  nombre: string | null
  correo: string | null
  telefono: string | null
  empresa: string | null
}

type ContactSearchResponse = {
  items: ContactSearchItem[]
  limit: number
  offset: number
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get("q") || "").trim()
  const limit = Math.max(1, Math.min(25, Number(searchParams.get("limit") || "8")))

  if (q.length < 2) {
    return NextResponse.json({ items: [], limit, offset: 0 })
  }

  const response = await callCrmApi<ContactSearchResponse>("/crm/contacts/search", {
    method: "GET",
    searchParams: { q, limit, offset: 0 },
    withUserToken: true,
  })

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "contacts_search_failed" },
      { status: response.status ?? 502 },
    )
  }

  return NextResponse.json(response.data)
}

