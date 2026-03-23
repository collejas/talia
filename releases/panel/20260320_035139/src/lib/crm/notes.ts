"use server";

import type { DataTableRow } from "@/components/data-table";
import { callCrmApi } from "@/lib/api/crm";

type CRMNote = {
  id: string;
  relacion_tipo: string;
  relacion_id: string;
  texto: string;
  visible_para_cliente: boolean;
  tipo: string;
  creado_por_usuario_id: string | null;
  creado_en: string;
  actualizado_en: string;
};

type CRMNotesResponse = {
  items: CRMNote[];
  limit: number;
  offset: number;
};

export type CrmNotesPayload = {
  rows: DataTableRow[];
  total: number;
  errors: string[];
};

export async function loadCrmNotes(): Promise<CrmNotesPayload> {
  const response = await callCrmApi<CRMNotesResponse>("/crm/notas", {
    searchParams: { limit: "100", offset: "0" },
  });

  if (!response.ok || !response.data || !Array.isArray(response.data.items)) {
    const errorMessage = response.ok ? "Respuesta inválida del CRM" : response.error;
    return { rows: [], total: 0, errors: [errorMessage] };
  }

  const rows = response.data.items.map<DataTableRow>((note, index) => ({
    id: index + 1,
    header: note.texto.slice(0, 60) + (note.texto.length > 60 ? "…" : ""),
    type: note.tipo,
    status: note.visible_para_cliente ? "Visible" : "Privada",
    target: note.relacion_tipo,
    limit: note.relacion_id.slice(0, 8),
    reviewer: note.creado_por_usuario_id || "Sistema",
    raw: note,
  }));

  return {
    rows,
    total: response.data.items.length,
    errors: [],
  };
}
