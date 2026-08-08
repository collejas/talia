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
  creado_por_usuario?: { id: string; nombre_completo: string | null } | null;
  oportunidad?: {
    id: string;
    codigo_oportunidad: string | null;
    titulo: string | null;
    contacto_nombre: string | null;
  } | null;
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

  const notes = response.ok
    ? Array.isArray(response.data)
      ? response.data
      : response.data && Array.isArray((response.data as CRMNotesResponse).items)
        ? (response.data as CRMNotesResponse).items
        : null
    : null;
  if (!notes) {
    const errorMessage = response.ok ? "Respuesta inválida del CRM" : response.error;
    return { rows: [], total: 0, errors: [errorMessage] };
  }

  const rows = notes.map<DataTableRow>((note, index) => ({
    id: index + 1,
    header: note.texto.slice(0, 60) + (note.texto.length > 60 ? "…" : ""),
    type: note.tipo,
    status: note.visible_para_cliente ? "Visible" : "Privada",
    target: note.oportunidad
      ? [note.oportunidad.codigo_oportunidad, note.oportunidad.titulo].filter(Boolean).join(" · ") || "Oportunidad"
      : note.relacion_tipo,
    limit: note.oportunidad?.contacto_nombre || "Relacionado",
    reviewer: note.creado_por_usuario?.nombre_completo?.trim() || note.creado_por_usuario_id || "Sistema",
    raw: {
      ...note,
      target_href: note.oportunidad
        ? `/embudo?oportunidadId=${encodeURIComponent(note.oportunidad.id)}`
        : note.relacion_tipo === "persona"
          ? `/personas/${encodeURIComponent(note.relacion_id)}`
          : note.relacion_tipo === "cuenta"
            ? `/empresas/${encodeURIComponent(note.relacion_id)}`
            : undefined,
    },
  }));

  return {
    rows,
    total: notes.length,
    errors: [],
  };
}
