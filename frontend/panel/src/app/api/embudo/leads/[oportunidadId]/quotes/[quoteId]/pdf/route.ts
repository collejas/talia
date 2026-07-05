import { NextResponse } from "next/server";

import { getPanelApiBaseUrl } from "@/lib/api/panel";
import { decodeJwtUserId } from "@/lib/auth/jwt";
import { resolvePanelApiToken } from "@/lib/auth/panel-token";
import { resolveServerAccessToken } from "@/lib/auth/server-session";
import { resolveOrganizacionId } from "@/lib/settings/org";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ oportunidadId: string; quoteId: string }> },
) {
  const { oportunidadId, quoteId } = await params;
  if (!oportunidadId || !quoteId) {
    return NextResponse.json({ error: "Falta oportunidadId o quoteId." }, { status: 400 });
  }

  const userAccessToken = (await resolveServerAccessToken({ minTtlSeconds: 300 })) || "";
  const organizacionId = await resolveOrganizacionId();
  const usuarioId = decodeJwtUserId(userAccessToken || null);

  let token: string;
  try {
    token = await resolvePanelApiToken();
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se encontró token del panel.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const baseUrl = getPanelApiBaseUrl();
  const backendUrl = new URL(`${baseUrl}/crm/oportunidades/${oportunidadId}/quotes/${quoteId}/pdf`);
  let backendResponse: Response;
  try {
    backendResponse = await fetch(backendUrl.toString(), {
      method: "GET",
      headers: {
        Accept: "application/pdf",
        Authorization: `Bearer ${token}`,
        ...(userAccessToken ? { "X-User-Token": userAccessToken } : {}),
        ...(organizacionId ? { "X-Organizacion-Id": organizacionId } : {}),
        ...(usuarioId ? { "X-Usuario-Id": usuarioId } : {}),
      },
      cache: "no-store",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "backend_unreachable";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const buffer = await backendResponse.arrayBuffer();
  if (!backendResponse.ok) {
    const text = new TextDecoder().decode(buffer);
    const message = text || `Error ${backendResponse.status}`;
    return NextResponse.json({ error: message }, { status: backendResponse.status });
  }

  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set(
    "Content-Disposition",
    backendResponse.headers.get("Content-Disposition") ?? 'inline; filename="cotizacion.pdf"',
  );

  return new NextResponse(buffer, { status: 200, headers });
}
