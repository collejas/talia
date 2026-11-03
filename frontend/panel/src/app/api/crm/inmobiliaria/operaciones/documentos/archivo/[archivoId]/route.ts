import { NextResponse } from "next/server"
import { callCrmApi } from "@/lib/api/crm"

export async function GET(request: Request, context: { params: Promise<{ archivoId: string }> }) {
  const { archivoId } = await context.params
  const download = new URL(request.url).searchParams.get("descargar") === "true"
  const query = download ? "?descargar=true" : ""
  const response = await callCrmApi<{ url?: string }>(`/crm/inmobiliaria/operaciones/documentos/archivo/${encodeURIComponent(archivoId)}${query}`, { withUserToken: true })
  if (!response.ok || !response.data?.url) return NextResponse.json({ error: response.ok ? "property_document_url_missing" : response.error }, { status: response.ok ? 502 : (response.status ?? 502) })
  return NextResponse.redirect(response.data.url)
}
