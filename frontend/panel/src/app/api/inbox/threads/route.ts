import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";
import { mapThreads } from "@/lib/inbox/threads";
import type { InboxThreadRow } from "@/lib/inbox/types";

function parseNumber(value: string | null, fallback: number, options: { min: number; max: number }): number {
  if (!value) return fallback;
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return fallback;
  return Math.min(options.max, Math.max(options.min, numeric));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseNumber(searchParams.get("limit"), 25, { min: 1, max: 100 });
  const messageLimit = parseNumber(searchParams.get("message_limit"), 20, { min: 1, max: 100 });

  const response = await callCrmApi<InboxThreadRow[]>("/crm/inbox/threads", {
    withUserToken: true,
    searchParams: {
      limit: String(limit),
      message_limit: String(messageLimit),
    },
  });

  if (!response.ok) {
    const status = response.status ?? 500;
    const error = response.error || "No se pudieron consultar las conversaciones";
    return NextResponse.json({ error }, { status });
  }

  const threads = mapThreads(response.data);
  return NextResponse.json({
    ok: true,
    threads,
  });
}
