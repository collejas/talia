import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

type Params = {
  params: Promise<{
    cuentaId: string;
  }>;
};

export async function GET(_request: Request, { params }: Params) {
  const { cuentaId } = await params;
  if (!cuentaId) {
    return NextResponse.json({ error: "cuenta_id_invalid" }, { status: 400 });
  }

  const response = await callCrmApi(`/crm/cuentas/${encodeURIComponent(cuentaId)}`, {
    withUserToken: true,
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error ?? "account_fetch_failed" },
      { status: response.status ?? 502 },
    );
  }

  const account = response.data as Record<string, unknown>;
  return NextResponse.json({
    item: {
      id: String(account.id ?? cuentaId),
      nombre: String(account.nombre ?? ""),
      alias: account.alias ? String(account.alias) : null,
      tipo: account.tipo ? String(account.tipo) : null,
      correo: account.correo ? String(account.correo) : null,
      telefono: account.telefono ? String(account.telefono) : null,
    },
  });
}
