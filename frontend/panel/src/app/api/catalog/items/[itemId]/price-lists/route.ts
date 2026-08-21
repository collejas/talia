import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function GET(
  _request: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await context.params;
  const response = await callCrmApi<unknown[]>(`/crm/catalog/items/${itemId}/price-lists`, {});
  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "No se pudieron consultar los precios del producto." },
      { status: response.status ?? 500 },
    );
  }
  return NextResponse.json({ items: Array.isArray(response.data) ? response.data : [] });
}
