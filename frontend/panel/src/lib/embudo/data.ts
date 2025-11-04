"use server";

import { callSupabaseRpc } from "@/lib/leads/supabase";

const DEFAULT_LIMIT = 200;

export type EmbudoStage = {
  id: string;
  nombre: string;
  categoria: string;
  tarjetas: EmbudoCard[];
};

export type EmbudoCard = {
  tarjetaId: string;
  contactoId: string;
  nombre: string;
  correo: string | null;
  telefono: string | null;
  canal: string | null;
  estado: string | null;
  etapaId: string;
  etapaNombre: string;
  monto: number | null;
  moneda: string | null;
  probabilidad: number | null;
  asignadoId: string | null;
  asignadoNombre: string | null;
  prioridad: number;
  actualizadoEn: string | null;
  etiquetas: string[];
  metadata: Record<string, unknown>;
};

export type EmbudoData = {
  stages: EmbudoStage[];
  errors: string[];
};

type LeadListRow = {
  tarjeta_id: string;
  contacto_id: string;
  contacto_nombre: string | null;
  contacto_correo: string | null;
  contacto_telefono: string | null;
  contacto_estado: string | null;
  canal: string | null;
  etapa_id: string;
  etapa_nombre: string;
  categoria: string;
  creado_en: string;
  actualizado_en: string | null;
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
  metadata: Record<string, unknown> | null;
  total_rows: number;
};

export async function loadEmbudoData(): Promise<EmbudoData> {
  const lista = await callSupabaseRpc<LeadListRow[]>("panel_leads_list", {
    body: {
      p_limit: DEFAULT_LIMIT,
      p_offset: 0,
      p_order_by: "actualizado_en",
      p_order_dir: "desc",
    },
  });

  const errors: string[] = [];
  if (!lista.ok) errors.push(lista.error);

  const stages = mapStages(lista.ok ? lista.data : []);
  return { stages, errors };
}

function mapStages(rows: LeadListRow[] | undefined): EmbudoStage[] {
  if (!rows || !rows.length) return [];
  const stageMap = new Map<string, EmbudoStage>();

  for (const row of rows) {
    const stageId = row.etapa_id;
    if (!stageMap.has(stageId)) {
      stageMap.set(stageId, {
        id: stageId,
        nombre: row.etapa_nombre,
        categoria: row.categoria,
        tarjetas: [],
      });
    }

    const stage = stageMap.get(stageId)!;
    stage.tarjetas.push({
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
    });
  }

  for (const stage of stageMap.values()) {
    stage.tarjetas.sort((a, b) => (b.actualizadoEn ? Date.parse(b.actualizadoEn) : 0) - (a.actualizadoEn ? Date.parse(a.actualizadoEn) : 0));
  }

  const orderedStages = Array.from(stageMap.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  return orderedStages;
}
