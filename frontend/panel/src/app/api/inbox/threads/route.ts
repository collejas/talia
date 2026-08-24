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

function parseBoolean(value: string | null, fallback: boolean): boolean {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseNumber(searchParams.get("limit"), 25, { min: 1, max: 100 });
  const offset = parseNumber(searchParams.get("offset"), 0, { min: 0, max: 10_000 });
  const messageLimit = parseNumber(searchParams.get("message_limit"), 20, { min: 1, max: 100 });
  const enrich = parseBoolean(searchParams.get("enrich"), false);
  const estado = searchParams.get("estado")?.trim() || "";
  const source = searchParams.get("source")?.trim() || "";
  const channel = searchParams.get("channel")?.trim() || "";
  const date = searchParams.get("date")?.trim() || "";
  const batchId = searchParams.get("batch_id")?.trim() || "";
  const campanaId = searchParams.get("campana_id")?.trim() || "";
  const search = searchParams.get("search")?.trim() || "";

  const response = await callCrmApi<InboxThreadRow[]>("/crm/inbox/threads", {
    withUserToken: true,
    searchParams: {
      limit: String(limit),
      offset: String(offset),
      message_limit: String(messageLimit),
      enrich: String(enrich),
      ...(estado ? { estado } : {}),
      ...(source ? { source } : {}),
      ...(channel ? { channel } : {}),
      ...(date ? { date } : {}),
      ...(batchId ? { batch_id: batchId } : {}),
      ...(campanaId ? { campana_id: campanaId } : {}),
      ...(search ? { search } : {}),
    },
  });

  if (!response.ok) {
    const status = response.status ?? 500;
    const error = response.error || "No se pudieron consultar las conversaciones";
    return NextResponse.json({ error }, { status });
  }

  const rows = Array.isArray(response.data) ? response.data : [];
  const totalThreads =
    rows.length && typeof rows[0]?.total_rows === "number" ? rows[0].total_rows : rows.length;
  const threads = mapThreads(rows);
  return NextResponse.json({
    ok: true,
    threads,
    total_threads: totalThreads,
  });
}
