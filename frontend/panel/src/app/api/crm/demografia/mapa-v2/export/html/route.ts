import { NextResponse } from "next/server";

import { getPanelApiBaseUrl } from "@/lib/api/panel";
import { decodeJwtUserId } from "@/lib/auth/jwt";
import { resolvePanelApiToken } from "@/lib/auth/panel-token";
import { resolveServerAccessToken } from "@/lib/auth/server-session";
import { resolveOrganizacionId } from "@/lib/settings/org";

export async function GET(request: Request) {
  const baseUrl = getPanelApiBaseUrl();
  let token: string;
  try {
    token = await resolvePanelApiToken();
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se encontró token del panel.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const sourceUrl = new URL(request.url);
  const backendUrl = new URL(`${baseUrl}/crm/demografia/mapa-v2/export/html`);
  sourceUrl.searchParams.forEach((value, key) => backendUrl.searchParams.append(key, value));
  const userAccessToken = (await resolveServerAccessToken({ minTtlSeconds: 300 })) || "";
  const organizacionId = await resolveOrganizacionId();
  const usuarioId = decodeJwtUserId(userAccessToken || null);

  let backendResponse: Response;
  try {
    backendResponse = await fetch(backendUrl.toString(), {
      method: "GET",
      headers: {
        Accept: "text/html",
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
    const message = new TextDecoder().decode(buffer) || `Error ${backendResponse.status}`;
    return NextResponse.json({ error: message }, { status: backendResponse.status });
  }

  const headers = new Headers();
  headers.set("Content-Type", backendResponse.headers.get("Content-Type") ?? "text/html; charset=utf-8");
  headers.set("Content-Disposition", backendResponse.headers.get("Content-Disposition") ?? 'attachment; filename="mapa_conversion.html"');

  return new NextResponse(buffer, { status: 200, headers });
}
