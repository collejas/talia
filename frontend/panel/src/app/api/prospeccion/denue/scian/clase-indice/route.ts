import { NextResponse } from "next/server";
import { getPanelApiBaseUrl } from "@/lib/api/panel";
import { resolveServerAccessToken } from "@/lib/auth/server-session";

async function resolveAccessToken(): Promise<string | null> {
  return resolveServerAccessToken({ minTtlSeconds: 300 });
}

function buildBackendUrl(request: Request): URL {
  const backendBase = getPanelApiBaseUrl();
  const target = new URL(`${backendBase}/crm/prospeccion/denue/scian/clase-indice`);
  const source = new URL(request.url);
  source.searchParams.forEach((value, key) => {
    target.searchParams.append(key, value);
  });
  return target;
}

async function proxy(request: Request): Promise<NextResponse> {
  const token = await resolveAccessToken();
  if (!token) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }

  const targetUrl = buildBackendUrl(request);
  let backendResponse: Response;
  try {
    backendResponse = await fetch(targetUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "backend_unreachable";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const respText = await backendResponse.text();
  return new NextResponse(respText || null, {
    status: backendResponse.status,
    headers: {
      "content-type": backendResponse.headers.get("content-type") ?? "application/json",
    },
  });
}

export async function GET(request: Request) {
  return proxy(request);
}
