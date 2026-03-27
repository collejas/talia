import { NextResponse } from "next/server";
import { getPanelApiBaseUrl } from "@/lib/api/panel";
import { resolveServerAccessToken } from "@/lib/auth/server-session";

async function resolveAccessToken(): Promise<string | null> {
  return resolveServerAccessToken({ minTtlSeconds: 300 });
}

function buildBackendUrl(request: Request): URL {
  const backendBase = getPanelApiBaseUrl();
  const target = new URL(`${backendBase}/crm/prospeccion/google/resultados`);
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
