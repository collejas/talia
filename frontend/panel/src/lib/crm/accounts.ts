"use server";

import { DataTableRow } from "@/components/data-table";
import { callCrmApi } from "@/lib/api/crm";

type CRMAccount = {
  id: string;
  organizacion_id: string;
  codigo_cuenta: string | null;
  nombre: string;
  alias: string | null;
  tipo: string | null;
  industria: string | null;
  tamano: string | null;
  sitio_web: string | null;
  telefono: string | null;
  correo: string | null;
  direccion: Record<string, unknown> | null;
  propietario_usuario_id: string | null;
  propietario_nombre: string | null;
  propietario?: {
    id: string;
    nombre_completo: string | null;
    correo: string | null;
  } | null;
  metadata: Record<string, unknown> | null;
  creado_en: string;
  actualizado_en: string;
};

type CRMAccountsResponse = {
  items: CRMAccount[];
  limit: number;
  offset: number;
};

export type CrmAccountsPayload = {
  rows: DataTableRow[];
  total: number;
  errors: string[];
};

export async function loadCrmAccounts(): Promise<CrmAccountsPayload> {
  const accountsResult = await callCrmApi<CRMAccountsResponse>("/crm/cuentas", {
    searchParams: { limit: "100", offset: "0" },
  });

  if (!accountsResult.ok) {
    return {
      rows: [],
      total: 0,
      errors: [accountsResult.error],
    };
  }

  const rows = accountsResult.data.items.map<DataTableRow>((account, index) => {
    return {
      id: index + 1,
      header: account.nombre,
      type: account.tipo || "Cuenta",
      status: account.industria || "Sin industria",
      target: account.sitio_web || "—",
      limit: account.telefono || account.correo || "—",
      reviewer: account.alias || "Sin alias",
      raw: {
        ...account,
        codigo_cuenta: account.codigo_cuenta,
      },
    };
  });

  return {
    rows,
    total: accountsResult.data.items.length,
    errors: [],
  };
}
