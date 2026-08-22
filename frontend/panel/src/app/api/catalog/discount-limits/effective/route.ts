"use server";

import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tipoPrecio = url.searchParams.get("tipo_precio");
  const listaPrecioId = url.searchParams.get("lista_precio_id");

  if (tipoPrecio !== "base" && tipoPrecio !== "lista") {
    return NextResponse.json({ error: "Tipo de precio inválido." }, { status: 400 });
  }
  if (tipoPrecio === "lista" && !listaPrecioId) {
    return NextResponse.json({ error: "Falta la lista de precios." }, { status: 400 });
  }

  const response = await callCrmApi<{ descuento_maximo_porcentaje: number | null }>(
    "/crm/catalog/discount-limits/effective",
    {
      searchParams: {
        tipo_precio: tipoPrecio,
        lista_precio_id: tipoPrecio === "lista" ? listaPrecioId : null,
      },
      withUserToken: true,
    },
  );

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "No se pudo consultar el límite de descuento." },
      { status: response.status ?? 500 },
    );
  }
  return NextResponse.json(response.data ?? { descuento_maximo_porcentaje: null });
}
