"use server";

import { callSupabaseRpc } from "@/lib/leads/supabase";

const DEFAULT_LIMIT = 200;

export type EmbudoStage = {
  id: string;
  nombre: string;
  categoria: string;
  orden: number;
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
  sinConversacion: EmbudoCard[];
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
  etapa_orden: number;
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

  const { stages, sinConversacion } = mapStages(lista.ok ? lista.data : []);
  return { stages, sinConversacion, errors };
}

function mapStages(rows: LeadListRow[] | undefined): { stages: EmbudoStage[]; sinConversacion: EmbudoCard[] } {
  if (!rows || !rows.length) {
    return { stages: [], sinConversacion: [] };
  }

  const stageMap = new Map<string, EmbudoStage>();
  const sinConversacion: EmbudoCard[] = [];

  for (const row of rows) {
    const tarjeta: EmbudoCard = {
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

    if (!row.conversacion_id) {
      sinConversacion.push(tarjeta);
      continue;
    }

    const stage = ensureStage(
      stageMap,
      row.etapa_id,
      row.etapa_nombre,
      row.categoria,
      row.etapa_orden ?? Number.MAX_SAFE_INTEGER
    );
    stage.tarjetas.push(tarjeta);
  }

  for (const stage of stageMap.values()) {
    stage.tarjetas.sort((a, b) => (b.actualizadoEn ? Date.parse(b.actualizadoEn) : 0) - (a.actualizadoEn ? Date.parse(a.actualizadoEn) : 0));
  }

  const orderedStages = Array.from(stageMap.values()).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"));

  sinConversacion.sort((a, b) => (b.actualizadoEn ? Date.parse(b.actualizadoEn) : 0) - (a.actualizadoEn ? Date.parse(a.actualizadoEn) : 0));

  return { stages: orderedStages, sinConversacion };
}

function ensureStage(map: Map<string, EmbudoStage>, id: string, nombre: string, categoria: string, orden: number): EmbudoStage {
  if (!map.has(id)) {
    map.set(id, {
      id,
      nombre,
      categoria,
      orden,
      tarjetas: [],
    });
  } else {
    const stage = map.get(id)!;
    stage.nombre = nombre;
    stage.categoria = categoria;
    stage.orden = orden;
  }
  return map.get(id)!;
}
