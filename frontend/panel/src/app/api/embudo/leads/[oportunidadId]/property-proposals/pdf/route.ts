import { NextResponse } from "next/server";

import { getPanelApiBaseUrl } from "@/lib/api/panel";
import { decodeJwtUserId } from "@/lib/auth/jwt";
import { resolvePanelApiToken } from "@/lib/auth/panel-token";
import { resolveServerAccessToken } from "@/lib/auth/server-session";
import { resolveOrganizacionId } from "@/lib/settings/org";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ oportunidadId: string }> },
) {
  const { oportunidadId } = await params;
  if (!oportunidadId) {
    return NextResponse.json({ error: "Falta oportunidadId." }, { status: 400 });
  }
  const userAccessToken = (await resolveServerAccessToken({ minTtlSeconds: 300 })) || "";
  const organizacionId = await resolveOrganizacionId();
  const usuarioId = decodeJwtUserId(userAccessToken || null);
  let token: string;
  try {
    token = await resolvePanelApiToken();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se encontró token del panel." },
      { status: 500 },
    );
  }
  let backendResponse: Response;
  try {
    backendResponse = await fetch(`${getPanelApiBaseUrl()}/crm/oportunidades/${oportunidadId}/property-proposals/pdf`, {
      method: "POST",
      headers: {
        Accept: "application/pdf",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(userAccessToken ? { "X-User-Token": userAccessToken } : {}),
        ...(organizacionId ? { "X-Organizacion-Id": organizacionId } : {}),
        ...(usuarioId ? { "X-Usuario-Id": usuarioId } : {}),
      },
      body: await request.text(),
      cache: "no-store",
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "backend_unreachable" }, { status: 502 });
  }
  const buffer = await backendResponse.arrayBuffer();
  if (!backendResponse.ok) {
    return NextResponse.json(
      { error: new TextDecoder().decode(buffer) || `Error ${backendResponse.status}` },
      { status: backendResponse.status },
    );
  }
  const headers = new Headers();
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", backendResponse.headers.get("Content-Disposition") ?? 'inline; filename="propuesta-inmobiliaria.pdf"');
  return new NextResponse(buffer, { status: 200, headers });
}
