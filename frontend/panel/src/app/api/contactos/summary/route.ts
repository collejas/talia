import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";
import type { ContactCards } from "@/lib/contactos/types";

type ContactSummaryResponse = ContactCards;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim() || "";
  const propietario = url.searchParams.get("propietario")?.trim() || "";
  const origen = url.searchParams.get("origen")?.trim() || "";
  const dateFrom = url.searchParams.get("from")?.trim() || "";
  const dateTo = url.searchParams.get("to")?.trim() || "";

  const response = await callCrmApi<ContactSummaryResponse>("/crm/contacts/summary", {
    method: "GET",
    searchParams: {
      ...(search ? { search } : {}),
      ...(propietario ? { propietario } : {}),
      ...(origen ? { origen } : {}),
      ...(dateFrom ? { from: dateFrom } : {}),
      ...(dateTo ? { to: dateTo } : {}),
    },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "contacts_summary_failed" },
      { status: response.status ?? 502 },
    );
  }

  return NextResponse.json(response.data);
}
