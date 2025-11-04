import { NextResponse } from "next/server";

import { callSupabaseRpc } from "@/lib/inbox/supabase";
import { mapThreads } from "@/lib/inbox/threads";
import type { InboxThreadRow } from "@/lib/inbox/types";

type SupabaseThreadsResponse =
  | {
      ok: false;
      status?: number;
      error: string;
    }
  | {
      ok: true;
      data: InboxThreadRow[] | null;
    };

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

  const rpcResponse = (await callSupabaseRpc<InboxThreadRow[]>("panel_inbox_threads", {
    body: { p_limit: limit, p_message_limit: messageLimit },
  })) as SupabaseThreadsResponse;

  if (!rpcResponse.ok) {
    const status = rpcResponse.status ?? 500;
    const error = rpcResponse.error || "No se pudieron consultar las conversaciones";
    return NextResponse.json({ error }, { status });
  }

  const threads = mapThreads(rpcResponse.data);
  return NextResponse.json({
    ok: true,
    threads,
  });
}
