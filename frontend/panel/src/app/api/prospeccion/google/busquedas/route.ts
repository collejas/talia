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

function buildBackendUrl(request: Request, basePath: string): URL {
  const backendBase = getPanelApiBaseUrl();
  const target = new URL(`${backendBase}${basePath}`);
  const source = new URL(request.url);
  source.searchParams.forEach((value, key) => {
    target.searchParams.append(key, value);
  });
  return target;
}

async function proxyRequest(request: Request, init: { method: "GET" | "POST" }): Promise<NextResponse> {
  const token = await resolveAccessToken();
  if (!token) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }

  let targetUrl: URL;
  try {
    targetUrl = buildBackendUrl(request, "/prospeccion/google/busquedas");
  } catch (error) {
    const message = error instanceof Error ? error.message : "backend_not_configured";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let backendResponse: Response;
  try {
    backendResponse = await fetch(targetUrl, {
      method: init.method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: init.method === "POST" ? await request.text() : undefined,
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
  return proxyRequest(request, { method: "GET" });
}

export async function POST(request: Request) {
  return proxyRequest(request, { method: "POST" });
}
