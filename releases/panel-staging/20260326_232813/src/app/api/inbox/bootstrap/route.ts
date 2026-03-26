import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";
import { mapThreads } from "@/lib/inbox/threads";
import type { InboxThreadRow } from "@/lib/inbox/types";

type InboxBootstrapResponse = {
  ok?: boolean;
  runtime_profile?: Record<string, unknown>;
  summary?: Record<string, unknown> | null;
  threads?: {
    items?: InboxThreadRow[];
    limit?: number;
    offset?: number;
  } | null;
  filter_options?: {
    batches?: Array<{ value?: string; label?: string | null }>;
    campanas?: Array<{ value?: string; label?: string | null }>;
  } | null;
};

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
  const includeSummary = parseBoolean(searchParams.get("include_summary"), false);
  const includeFilterOptions = parseBoolean(searchParams.get("include_filter_options"), false);
  const estado = searchParams.get("estado")?.trim() || "";
  const source = searchParams.get("source")?.trim() || "";
  const channel = searchParams.get("channel")?.trim() || "";
  const date = searchParams.get("date")?.trim() || "";
  const batchId = searchParams.get("batch_id")?.trim() || "";
  const campanaId = searchParams.get("campana_id")?.trim() || "";

  const response = await callCrmApi<InboxBootstrapResponse>("/crm/inbox/bootstrap", {
    withUserToken: true,
    searchParams: {
      limit: String(limit),
      offset: String(offset),
      message_limit: String(messageLimit),
      enrich: String(enrich),
      include_summary: String(includeSummary),
      include_filter_options: String(includeFilterOptions),
      ...(estado ? { estado } : {}),
      ...(source ? { source } : {}),
      ...(channel ? { channel } : {}),
      ...(date ? { date } : {}),
      ...(batchId ? { batch_id: batchId } : {}),
      ...(campanaId ? { campana_id: campanaId } : {}),
    },
  });

  if (!response.ok) {
    const status = response.status ?? 500;
    const error = response.error || "No se pudo consultar inbox bootstrap";
    return NextResponse.json({ error }, { status });
  }

  const payload = response.data ?? {};
  const rows = Array.isArray(payload.threads?.items) ? payload.threads?.items : [];
  const totalThreads =
    rows.length && typeof rows[0]?.total_rows === "number" ? rows[0].total_rows : rows.length;
  const threads = mapThreads(rows);
  return NextResponse.json({
    ok: true,
    runtime_profile: payload.runtime_profile ?? null,
    summary: payload.summary ?? null,
    filter_options: payload.filter_options ?? null,
    threads,
    total_threads: totalThreads,
    limit: payload.threads?.limit ?? limit,
    offset: payload.threads?.offset ?? offset,
  });
}
