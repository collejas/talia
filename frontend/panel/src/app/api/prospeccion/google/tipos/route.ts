import { NextResponse } from "next/server";
import { getPanelApiBaseUrl } from "@/lib/api/panel";
import { resolveServerAccessToken } from "@/lib/auth/server-session";

function buildBackendUrl(request: Request): URL {
  const target = new URL(`${getPanelApiBaseUrl()}/crm/prospeccion/google/tipos`);
  const source = new URL(request.url);
  source.searchParams.forEach((value, key) => target.searchParams.append(key, value));
  return target;
}

export async function GET(request: Request) {
  const token = await resolveServerAccessToken({ minTtlSeconds: 300 });
  if (!token) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }

  let response: Response;
  try {
    response = await fetch(buildBackendUrl(request), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "backend_unreachable" }, { status: 502 });
  }

  const body = await response.text();
  return new NextResponse(body || null, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}
