"use server";

import { NextResponse } from "next/server";
import { callCrmApi } from "@/lib/api/crm";

export async function GET() {
  const response = await callCrmApi("/crm/demografia/geo/estados", {
    withUserToken: true,
  });
  if (!response.ok) {
    console.error("crm.demografia.geo.estados failed", response.status, response.error);
    return NextResponse.json(
      { error: "geojson_missing", message: "No fue posible cargar los estados." },
      { status: 500 },
    );
  }
  return NextResponse.json(response.data);
}
