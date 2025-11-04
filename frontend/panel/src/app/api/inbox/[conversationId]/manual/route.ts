import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/cookies";
import { getPanelApiBaseUrl } from "@/lib/api/panel";
import {
  buildBackendTargets,
  extractConversationIdFromPath,
  fallbackErrorFromText,
  looksLikeHtml,
} from "@/lib/inbox/backend";

type ManualRequestBody = {
  manual?: unknown;
};

type BackendManualResponse = {
  ok?: boolean;
  manual?: boolean;
  error?: string;
  detail?: string;
  message?: string;
};

type RouteContext = {
  params?: {
    conversationId?: string;
  };
};

function parseBody(raw: string): ManualRequestBody {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw);
    if (data && typeof data === "object") {
      return data as ManualRequestBody;
    }
    return {};
  } catch {
    return {};
  }
}

function parseBackendResponse(raw: string): BackendManualResponse {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") {
      return {};
    }
    const record = data as Record<string, unknown>;
    return {
      ok: typeof record.ok === "boolean" ? record.ok : undefined,
      manual:
        typeof record.manual === "boolean" ? record.manual : undefined,
      error: typeof record.error === "string" ? record.error : undefined,
      detail: typeof record.detail === "string" ? record.detail : undefined,
      message: typeof record.message === "string" ? record.message : undefined,
    };
  } catch {
    return {};
  }
}

function extractBackendError(payload: BackendManualResponse): string | undefined {
  if (payload.error && payload.error.trim().length) {
    return payload.error;
  }
  if (payload.detail && payload.detail.trim().length) {
    return payload.detail;
  }
  if (payload.message && payload.message.trim().length) {
    return payload.message;
  }
  return undefined;
}

export async function POST(request: Request, context: unknown) {
  const routeContext = (context as RouteContext | null) ?? {};
  const conversationId =
    routeContext.params?.conversationId?.trim() ??
    extractConversationIdFromPath(request.url);
  if (!conversationId) {
    return NextResponse.json({ error: "conversation_required" }, { status: 400 });
  }

  const rawBody = await request.text();
  const body = parseBody(rawBody);
  const manualValue = body.manual;

  if (typeof manualValue !== "boolean") {
    return NextResponse.json({ error: "manual_flag_required" }, { status: 422 });
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

  const backendTargets = buildBackendTargets(backendBaseUrl, conversationId, "manual");
  if (!backendTargets.length) {
    return NextResponse.json(
      { error: "backend_url_invalid" },
      { status: 500 },
    );
  }

  console.log("[inbox] manual targets", backendTargets);

  let backendResponse: Response | null = null;
  let backendText = "";
  let backendPayload: BackendManualResponse = {};

  for (let index = 0; index < backendTargets.length; index++) {
    const targetUrl = backendTargets[index]!;
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ manual: manualValue }),
      cache: "no-store",
    });
    const text = await response.text();
    const parsed = parseBackendResponse(text);
    const html = looksLikeHtml(text);

    console.log("[inbox] manual toggle attempt", {
      target: targetUrl,
      status: response.status,
      html,
      sample: text.slice(0, 120),
    });

    backendResponse = response;
    backendText = text;
    backendPayload = parsed;

    if (!response.ok && response.status === 404 && html && index + 1 < backendTargets.length) {
      continue;
    }

    break;
  }

  if (!backendResponse) {
    return NextResponse.json({ error: "manual_request_failed" }, { status: 502 });
  }

  if (!backendResponse.ok) {
    const detail = extractBackendError(backendPayload) ?? "manual_request_failed";
    const enriched = detail === "manual_request_failed"
      ? fallbackErrorFromText(backendText) ?? detail
      : detail;
    return NextResponse.json({ error: enriched }, { status: backendResponse.status });
  }

  return NextResponse.json({
    ok: backendPayload.ok ?? true,
    manual: typeof backendPayload.manual === "boolean" ? backendPayload.manual : manualValue,
  });
}
