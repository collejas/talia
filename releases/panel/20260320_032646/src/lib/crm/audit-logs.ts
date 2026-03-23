"use server";

import type { DataTableRow } from "@/components/data-table";
import { callCrmApi } from "@/lib/api/crm";

type CRMAuditLog = {
  id: string;
  usuario_id: string | null;
  accion: string;
  tabla: string;
  registro_id: string | null;
  cambios: Record<string, unknown> | null;
  ip: string | null;
  user_agent: string | null;
  creado_en: string;
};

export type CrmAuditLogsPayload = {
  rows: DataTableRow[];
  total: number;
  errors: string[];
};

type CRMAuditLogsResponse = {
  items: CRMAuditLog[];
  limit: number;
  offset: number;
};

export async function loadCrmAuditLogs(): Promise<CrmAuditLogsPayload> {
  const response = await callCrmApi<CRMAuditLogsResponse>("/crm/audit_logs", {
    searchParams: { limit: "100", offset: "0" },
  });

  if (!response.ok || !response.data || !Array.isArray(response.data.items)) {
    const errorMessage = response.ok ? "Respuesta inválida del CRM" : response.error;
    return { rows: [], total: 0, errors: [errorMessage] };
  }

  const rows = response.data.items.map<DataTableRow>((log, index) => ({
    id: index + 1,
    header: log.accion || "Acción",
    type: log.tabla,
    status: log.usuario_id || "Sistema",
    target: log.registro_id?.slice(0, 8) || "N/A",
    limit: log.ip || "Sin IP",
    reviewer: log.creado_en,
    raw: log,
  }));

  return {
    rows,
    total: response.data.items.length,
    errors: [],
  };
}
