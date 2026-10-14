import { NextResponse } from "next/server"
import { callCrmApi } from "@/lib/api/crm"

export async function GET(_request: Request, context: { params: Promise<{ archivoId: string }> }) {
  const { archivoId } = await context.params
  const response = await callCrmApi<{ url?: string }>(`/crm/inmobiliaria/operaciones/documentos/archivo/${encodeURIComponent(archivoId)}`, { withUserToken: true })
  if (!response.ok || !response.data?.url) return NextResponse.json({ error: response.ok ? "property_document_url_missing" : response.error }, { status: response.ok ? 502 : (response.status ?? 502) })
  return NextResponse.redirect(response.data.url)
}
