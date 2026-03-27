"use server";

import type { DataTableRow } from "@/components/data-table";
import { callCrmApi } from "@/lib/api/crm";

type CRMFile = {
  id: string;
  relacion_tipo: string;
  relacion_id: string;
  nombre_original: string;
  content_type: string | null;
  tamano_bytes: number | null;
  storage_path: string;
  metadata: Record<string, unknown> | null;
  subido_por_usuario_id: string | null;
  subido_en: string;
};

type CRMFilesResponse = {
  items: CRMFile[];
  limit: number;
  offset: number;
};

export type CrmFilesPayload = {
  rows: DataTableRow[];
  total: number;
  errors: string[];
};

export async function loadCrmFiles(): Promise<CrmFilesPayload> {
  const response = await callCrmApi<CRMFilesResponse>("/crm/archivos", {
    searchParams: { limit: "100", offset: "0" },
  });

  if (!response.ok || !response.data || !Array.isArray(response.data.items)) {
    const errorMessage = response.ok ? "Respuesta inválida del CRM" : response.error;
    return { rows: [], total: 0, errors: [errorMessage] };
  }

  const rows = response.data.items.map<DataTableRow>((file, index) => ({
    id: index + 1,
    header: file.nombre_original,
    type: file.content_type || "Sin tipo",
    status: formatSize(file.tamano_bytes),
    target: file.relacion_tipo,
    limit: file.relacion_id.slice(0, 8),
    reviewer: file.subido_por_usuario_id || "Desconocido",
    raw: file,
  }));

  return {
    rows,
    total: response.data.items.length,
    errors: [],
  };
}

function formatSize(size: number | null): string {
  if (size == null || Number.isNaN(size)) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
