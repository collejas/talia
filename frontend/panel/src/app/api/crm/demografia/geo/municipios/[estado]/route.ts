"use server";

import { NextResponse } from "next/server";
import { callCrmApi } from "@/lib/api/crm";

type Params = {
  params: Promise<{
    estado: string;
  }>;
};

function normalizeStateCode(value: string): string | null {
  const digits = value.replace(/[^\d]+/g, "");
  if (!digits) return null;
  return digits.padStart(2, "0");
}

export async function GET(_request: Request, { params }: Params) {
  const { estado } = await params;
  if (!estado) {
    return NextResponse.json({ error: "estado_invalid" }, { status: 400 });
  }
  const estadoCode = normalizeStateCode(estado);
  if (!estadoCode) {
    return NextResponse.json({ error: "estado_invalid" }, { status: 400 });
  }

  const response = await callCrmApi(`/crm/demografia/geo/municipios/${estadoCode}`, {
    withUserToken: true,
  });
  if (!response.ok) {
    if (response.status === 404) {
      return NextResponse.json({ error: "estado_not_found" }, { status: 404 });
    }
    console.error("crm.demografia.geo.municipios failed", response.status, response.error);
    return NextResponse.json(
      { error: "geojson_missing", message: "No fue posible cargar los municipios." },
      { status: 500 },
    );
  }
  return NextResponse.json(response.data);
}
