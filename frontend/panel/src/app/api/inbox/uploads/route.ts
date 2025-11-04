import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/cookies";
import { getPanelApiBaseUrl } from "@/lib/api/panel";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const conversationId = formData.get("conversationId");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file_required" }, { status: 400 });
  }

  if (typeof conversationId !== "string" || !conversationId.trim().length) {
    return NextResponse.json({ error: "conversation_required" }, { status: 400 });
  }

  const store = await cookies();
  const accessToken = store.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!accessToken) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }

  let backendBaseUrl: string;
  try {
    backendBaseUrl = getPanelApiBaseUrl();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "backend_not_configured" },
      { status: 500 },
    );
  }

  const backendForm = new FormData();
  backendForm.append("file", file, file.name);
  backendForm.append("conversation_id", conversationId.trim());

  const response = await fetch(`${backendBaseUrl}/webchat/uploads`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: backendForm,
    cache: "no-store",
  });

  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { error: text || "upload_failed" };
  }

  if (!response.ok) {
    const errorMessage =
      typeof payload === "object" && payload && "error" in payload && typeof (payload as Record<string, unknown>).error === "string"
        ? (payload as Record<string, string>).error
        : "upload_failed";
    return NextResponse.json({ error: errorMessage }, { status: response.status });
  }

  return NextResponse.json(payload ?? { ok: true });
}
