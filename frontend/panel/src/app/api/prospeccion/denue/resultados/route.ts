import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/cookies";
import { getPanelApiBaseUrl } from "@/lib/api/panel";

async function resolveAccessToken(): Promise<string | null> {
  const store = await cookies();
  const cookieToken = store.get(ACCESS_TOKEN_COOKIE)?.value;
  if (cookieToken && cookieToken.trim().length) {
    return cookieToken;
  }
  const fallback =
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_API_KEY;
  return fallback?.trim().length ? fallback.trim() : null;
}

function buildBackendUrl(request: Request): URL {
  const backendBase = getPanelApiBaseUrl();
  const target = new URL(`${backendBase}/crm/prospeccion/denue/resultados`);
  const source = new URL(request.url);
  source.searchParams.forEach((value, key) => {
    target.searchParams.append(key, value);
  });
  return target;
}

async function proxyRequest(request: Request, method: "GET" | "DELETE"): Promise<NextResponse> {
  const token = await resolveAccessToken();
  if (!token) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }

  let targetUrl: URL;
  try {
    targetUrl = buildBackendUrl(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "backend_not_configured";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let backendResponse: Response;
  try {
    backendResponse = await fetch(targetUrl, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: method === "DELETE" ? await request.text() : undefined,
      cache: "no-store",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "backend_unreachable";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const respText = await backendResponse.text();
  const contentType = backendResponse.headers.get("content-type") ?? "application/json";
  return new NextResponse(respText || null, {
    status: backendResponse.status,
    headers: {
      "content-type": contentType,
    },
  });
}

export async function GET(request: Request) {
  return proxyRequest(request, "GET");
}

export async function DELETE(request: Request) {
  return proxyRequest(request, "DELETE");
}
