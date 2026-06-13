import { NextResponse } from "next/server";

import { loadLeadsData } from "@/lib/leads/data";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const days = Number(url.searchParams.get("days") || "30");
  const desde = url.searchParams.get("desde") || undefined;
  const hasta = url.searchParams.get("hasta") || undefined;

  const payload = await loadLeadsData({
    days: Number.isFinite(days) ? days : 30,
    desde,
    hasta,
  });

  return NextResponse.json(payload);
}
