"use server";

import { DataTableRow } from "@/components/data-table";
import { callCrmApi } from "@/lib/api/crm";

type CRMAccount = {
  id: string;
  organizacion_id: string;
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
  const result = await callCrmApi<CRMAccountsResponse>("/crm/cuentas", {
    searchParams: { limit: "100", offset: "0" },
  });

  if (!result.ok) {
    return {
      rows: [],
      total: 0,
      errors: [result.error],
    };
  }

  const rows = result.data.items.map<DataTableRow>((account, index) => ({
    id: index + 1,
    header: account.nombre,
    type: account.tipo || "Cuenta",
    status: account.industria || "Sin industria",
    target: account.sitio_web || "—",
    limit: account.telefono || account.correo || "—",
    reviewer: account.alias || "Sin alias",
    raw: account,
  }));

  return {
    rows,
    total: result.data.items.length,
    errors: [],
  };
}
