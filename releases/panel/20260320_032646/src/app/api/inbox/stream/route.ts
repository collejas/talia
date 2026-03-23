import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getPanelApiBaseUrl } from "@/lib/api/panel";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/cookies";
import { decodeJwtUserId } from "@/lib/auth/jwt";
import { resolvePanelApiToken } from "@/lib/auth/panel-token";
import { resolveOrganizacionId } from "@/lib/settings/org";

export async function GET() {
  let backendUrl: string;
  let apiToken: string;
  try {
    backendUrl = getPanelApiBaseUrl();
    apiToken = await resolvePanelApiToken();
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo resolver configuración del backend.",
      },
      { status: 500 },
    );
  }

  const store = await cookies();
  const userAccessToken =
    store.get(ACCESS_TOKEN_COOKIE)?.value ||
    store.get("talia.access_token")?.value ||
    store.get("sb-access-token")?.value ||
    store.get("access_token")?.value ||
    "";
  const organizacionId = await resolveOrganizacionId();
  const usuarioId = decodeJwtUserId(userAccessToken || null);

  const headers: Record<string, string> = {
    Accept: "text/event-stream",
    Authorization: `Bearer ${apiToken}`,
  };
  if (userAccessToken) {
    headers["X-User-Token"] = userAccessToken;
  }
  if (organizacionId) {
    headers["X-Organizacion-Id"] = organizacionId;
  }
  if (usuarioId) {
    headers["X-Usuario-Id"] = usuarioId;
  }

  let backendResponse: Response;
  try {
    backendResponse = await fetch(`${backendUrl}/crm/inbox/stream`, {
      method: "GET",
      headers,
      cache: "no-store",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "No se pudo conectar al backend.",
      },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  backendResponse.headers.forEach((value, key) => {
    responseHeaders.set(key, value);
  });
  responseHeaders.set("Cache-Control", responseHeaders.get("cache-control") ?? "no-cache");
  responseHeaders.set("Content-Type", "text/event-stream");
  responseHeaders.set("Connection", "keep-alive");

  return new NextResponse(backendResponse.body, {
    status: backendResponse.status,
    headers: responseHeaders,
  });
}
