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
      correo: account.correo_principal ? String(account.correo_principal) : account.correo ? String(account.correo) : null,
      correo_principal: account.correo_principal ? String(account.correo_principal) : account.correo ? String(account.correo) : null,
      correo_secundario: account.correo_secundario ? String(account.correo_secundario) : null,
      telefono: account.telefono_principal_e164 ? String(account.telefono_principal_e164) : account.telefono ? String(account.telefono) : null,
      telefono_principal_e164: account.telefono_principal_e164 ? String(account.telefono_principal_e164) : account.telefono ? String(account.telefono) : null,
      telefono_principal_tipo_linea: account.telefono_principal_tipo_linea ? String(account.telefono_principal_tipo_linea) : null,
      telefono_principal_extension: account.telefono_principal_extension ? String(account.telefono_principal_extension) : null,
      telefono_secundario_e164: account.telefono_secundario_e164 ? String(account.telefono_secundario_e164) : null,
      telefono_secundario_tipo_linea: account.telefono_secundario_tipo_linea ? String(account.telefono_secundario_tipo_linea) : null,
      telefono_secundario_extension: account.telefono_secundario_extension ? String(account.telefono_secundario_extension) : null,
    },
  });
}
