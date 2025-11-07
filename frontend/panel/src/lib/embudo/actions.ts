"use server";

import { revalidateTag } from "next/cache";

import { callSupabaseRpc } from "@/lib/leads/supabase";
import type { EmbudoCard, EmbudoStage } from "@/lib/embudo/data";

type LeadRow = {
  tarjeta_id: string;
  contacto_id: string;
  contacto_nombre: string | null;
  contacto_correo: string | null;
  contacto_telefono: string | null;
  contacto_estado: string | null;
  canal: string | null;
  etapa_id: string;
  etapa_nombre: string;
  etapa_orden: number;
  categoria: "abierta" | "ganada" | "perdida";
  creado_en: string;
  actualizado_en: string;
  cerrado_en: string | null;
  monto_estimado: number | null;
  moneda: string | null;
  probabilidad: number | null;
  lead_score: number | null;
  asignado_id: string | null;
  asignado_nombre: string | null;
  propietario_id: string | null;
  propietario_nombre: string | null;
  conversacion_id: string | null;
  ultimo_mensaje_en: string | null;
  motivo_cierre: string | null;
  tags: string[] | null;
  metadata: Record<string, unknown>;
  total_rows: number;
};

export type UpdateLeadInput = {
  tarjetaId: string;
  contacto?: Record<string, unknown>;
  tarjeta?: Record<string, unknown>;
  mergeMetadata?: boolean;
};

export type MoveLeadInput = {
  tarjetaId: string;
  etapaDestino: string;
  motivo?: string | null;
  metadata?: Record<string, unknown>;
  fuente?: "humano" | "asistente" | "api";
  expectedEtapa?: string | null;
};

export type LeadActionResult =
  | { ok: true; stage: EmbudoStage; card: EmbudoCard }
  | { ok: false; error: string };

function mapRowToStage(row: LeadRow): { stage: EmbudoStage; card: EmbudoCard } {
  const stage: EmbudoStage = {
    id: row.etapa_id,
    nombre: row.etapa_nombre,
    categoria: row.categoria,
    orden: row.etapa_orden ?? Number.MAX_SAFE_INTEGER,
    tarjetas: [],
  };

  const card: EmbudoCard = {
    tarjetaId: row.tarjeta_id,
    contactoId: row.contacto_id,
    nombre: row.contacto_nombre?.trim() || "Lead sin nombre",
    correo: row.contacto_correo,
    telefono: row.contacto_telefono,
    canal: row.canal,
    estado: row.contacto_estado,
    etapaId: row.etapa_id,
    etapaNombre: row.etapa_nombre,
    monto: row.monto_estimado,
    moneda: row.moneda,
    probabilidad: row.probabilidad,
    asignadoId: row.asignado_id,
    asignadoNombre: row.asignado_nombre,
    prioridad: row.lead_score ?? 0,
    actualizadoEn: row.actualizado_en,
    etiquetas: row.tags ?? [],
    metadata: row.metadata ?? {},
  };

  return { stage, card };
}

function extractRow(data: unknown): LeadRow | null {
  if (!Array.isArray(data) || !data.length) return null;
  const row = data[0] as LeadRow;
  if (!row || typeof row !== "object") return null;
  return row;
}

export async function updateLeadCard(input: UpdateLeadInput): Promise<LeadActionResult> {
  const payload = {
    p_tarjeta_id: input.tarjetaId,
    p_contacto: input.contacto ?? {},
    p_tarjeta: input.tarjeta ?? {},
    p_merge_metadata: input.mergeMetadata ?? true,
  };

  const response = await callSupabaseRpc<LeadRow[]>("panel_lead_update", {
    body: payload,
  });

  if (!response.ok) {
    return { ok: false, error: response.error };
  }

  const row = extractRow(response.data);
  if (!row) {
    return { ok: false, error: "No se recibió información del lead actualizado." };
  }

  revalidateTag("embudo", "default");
  const mapped = mapRowToStage(row);
  return { ok: true, stage: mapped.stage, card: mapped.card };
}

export async function moveLeadCard(input: MoveLeadInput): Promise<LeadActionResult> {
  const payload = {
    p_tarjeta_id: input.tarjetaId,
    p_etapa_destino: input.etapaDestino,
    p_fuente: input.fuente ?? "humano",
    p_motivo: input.motivo ?? null,
    p_metadata: input.metadata ?? {},
    p_expected_etapa: input.expectedEtapa ?? null,
  };

  const response = await callSupabaseRpc<LeadRow[]>("panel_lead_move", {
    body: payload,
  });

  if (!response.ok) {
    return { ok: false, error: response.error };
  }

  const row = extractRow(response.data);
  if (!row) {
    return { ok: false, error: "No se recibió información del movimiento del lead." };
  }

  revalidateTag("embudo", "default");
  const mapped = mapRowToStage(row);
  return { ok: true, stage: mapped.stage, card: mapped.card };
}
