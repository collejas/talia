import { NextResponse } from "next/server";
import { callCrmApi } from "@/lib/api/crm";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 200;
  const scope = (url.searchParams.get("scope") || "team").toLowerCase();
  const normalizedScope = scope === "all" ? "all" : "team";

  const response = await callCrmApi("/crm/usuarios/vendedores", {
    searchParams: {
      limit: String(limit),
      scope: normalizedScope,
    },
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error ?? "vendors_fetch_failed" },
      { status: response.status ?? 502 },
    );
  }

  return NextResponse.json({ vendedores: response.data ?? [] });
}
