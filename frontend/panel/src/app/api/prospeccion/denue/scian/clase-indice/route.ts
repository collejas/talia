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
  return null;
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
