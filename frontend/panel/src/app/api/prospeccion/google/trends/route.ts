import { NextResponse } from "next/server";

import { getPanelApiBaseUrl } from "@/lib/api/panel";
import { resolveServerAccessToken } from "@/lib/auth/server-session";

export async function POST(request: Request) {
  const token = await resolveServerAccessToken({ minTtlSeconds: 300 });
  if (!token) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }

  let targetUrl: string;
  try {
    targetUrl = `${getPanelApiBaseUrl()}/crm/prospeccion/google/trends`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "backend_not_configured";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let backendResponse: Response;
  try {
    backendResponse = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: await request.text(),
      cache: "no-store",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "backend_unreachable";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const text = await backendResponse.text();
  const contentType = backendResponse.headers.get("content-type") ?? "application/json";
  return new NextResponse(text || null, {
    status: backendResponse.status,
    headers: { "content-type": contentType },
  });
}
