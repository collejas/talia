"use server";

import { callSupabaseRest, callSupabaseRpc } from "@/lib/leads/supabase";

const DEFAULT_LIMIT = 200;

export type EmbudoStage = {
  id: string;
  nombre: string;
  codigo: string;
  categoria: string;
  orden: number;
  tableroId: string;
  metadatos: Record<string, unknown>;
  tarjetas: EmbudoCard[];
};

export type EmbudoCard = {
  tarjetaId: string;
  contactoId: string;
  conversacionId: string | null;
  nombre: string;
  correo: string | null;
  telefono: string | null;
  empresa: string | null;
  notas: string | null;
  necesidadProposito: string | null;
  canal: string | null;
  estado: string | null;
  etapaId: string;
  etapaNombre: string;
  monto: number | null;
  moneda: string | null;
  probabilidad: number | null;
  proyectoNombre: string | null;
  proyectoNecesidades: string | null;
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
  visitantesSinChat: number;
  errors: string[];
};

type LeadListRow = {
  tarjeta_id: string;
  contacto_id: string;
  contacto_nombre: string | null;
  contacto_correo: string | null;
  contacto_telefono: string | null;
  contacto_empresa: string | null;
  contacto_notas: string | null;
  contacto_necesidad: string | null;
  contacto_estado: string | null;
  canal: string | null;
  etapa_id: string;
  etapa_nombre: string;
  etapa_codigo: string;
  categoria: string;
  etapa_orden: number;
  etapa_metadatos: Record<string, unknown> | null;
  creado_en: string;
  actualizado_en: string | null;
  cerrado_en: string | null;
  monto_estimado: number | null;
  moneda: string | null;
  probabilidad: number | null;
  proyecto_nombre: string | null;
  proyecto_necesidades: string | null;
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

type LeadStageRow = {
  id: string;
  tablero_id: string;
  codigo: string;
  nombre: string;
  categoria: string;
  orden: number | null;
  metadatos: Record<string, unknown> | null;
};

type VisitantesCounterRow = {
  total: number | string | null | undefined;
};

function parseMetadatos(input: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  return input;
}

function isCounterOnlyStage(metadatos: Record<string, unknown>): boolean {
  const value = metadatos["is_counter_only"];
  return value === true || value === "true";
}

export async function loadEmbudoData(): Promise<EmbudoData> {
  const [stageResult, listResult, visitantesResult] = await Promise.all([
    callSupabaseRest<LeadStageRow[]>("lead_etapas", {
      query: {
        select: "id,tablero_id,codigo,nombre,categoria,orden,metadatos",
        order: "orden.asc,nombre.asc",
      },
    }),
    callSupabaseRpc<LeadListRow[]>("panel_leads_list", {
      body: {
        p_limit: DEFAULT_LIMIT,
        p_offset: 0,
        p_order_by: "actualizado_en",
        p_order_dir: "desc",
      },
    }),
    callSupabaseRpc<VisitantesCounterRow[] | VisitantesCounterRow>("embudo_visitantes_contador", {
      body: {
        p_closed_after: null,
        p_closed_before: null,
      },
    }),
  ]);

  const errors: string[] = [];
  if (!stageResult.ok) errors.push(stageResult.error);
  if (!listResult.ok) errors.push(listResult.error);
  if (!visitantesResult.ok) errors.push(visitantesResult.error);

  const { stages, sinConversacion } = mapStages(
    stageResult.ok ? stageResult.data : [],
    listResult.ok ? listResult.data : [],
  );

  let visitantesSinChat = 0;
  if (visitantesResult.ok) {
    const payload = visitantesResult.data;
    const row = Array.isArray(payload) ? payload[0] : payload;
    const value = row?.total;
    if (typeof value === "number") {
      visitantesSinChat = value;
    } else if (typeof value === "string") {
      const parsed = parseInt(value, 10);
      if (!Number.isNaN(parsed)) {
        visitantesSinChat = parsed;
      }
    }
  }

  return {
    stages,
    sinConversacion,
    visitantesSinChat,
    errors: Array.from(new Set(errors)),
  };
}

function mapStages(
  stageRows: LeadStageRow[] | undefined,
  rows: LeadListRow[] | undefined,
): { stages: EmbudoStage[]; sinConversacion: EmbudoCard[] } {
  const stageMap = new Map<string, EmbudoStage>();
  const sinConversacion: EmbudoCard[] = [];

  if (stageRows && stageRows.length) {
    for (const stageRow of stageRows) {
      const metadatos = parseMetadatos(stageRow.metadatos);
      if (isCounterOnlyStage(metadatos)) {
        continue;
      }

      stageMap.set(stageRow.id, {
        id: stageRow.id,
        nombre: stageRow.nombre,
        codigo: stageRow.codigo,
        categoria: stageRow.categoria,
        orden: typeof stageRow.orden === "number" ? stageRow.orden : Number.MAX_SAFE_INTEGER,
        tableroId: stageRow.tablero_id,
        metadatos,
        tarjetas: [],
      });
    }
  }

  if (!rows || !rows.length) {
    const orderedStages = Array.from(stageMap.values()).sort(
      (a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"),
    );
    return { stages: orderedStages, sinConversacion };
  }

  for (const row of rows) {
    const stageMetadatos = parseMetadatos(row.etapa_metadatos);
    if (isCounterOnlyStage(stageMetadatos)) {
      continue;
    }

    const tarjeta: EmbudoCard = {
      tarjetaId: row.tarjeta_id,
      contactoId: row.contacto_id,
      conversacionId: row.conversacion_id,
      nombre: row.contacto_nombre?.trim() || "Lead sin nombre",
      correo: row.contacto_correo,
      telefono: row.contacto_telefono,
      empresa: row.contacto_empresa,
      notas: row.contacto_notas,
      necesidadProposito: row.contacto_necesidad ?? null,
      canal: row.canal,
      estado: row.contacto_estado,
      etapaId: row.etapa_id,
      etapaNombre: row.etapa_nombre,
      monto: row.monto_estimado,
      moneda: row.moneda,
      probabilidad: row.probabilidad,
      proyectoNombre: row.proyecto_nombre ?? null,
      proyectoNecesidades: row.proyecto_necesidades ?? null,
      asignadoId: row.asignado_id,
      asignadoNombre: row.asignado_nombre,
      prioridad: row.lead_score ?? 0,
      actualizadoEn: row.actualizado_en,
      etiquetas: row.tags ?? [],
      metadata: row.metadata ?? {},
    };

    const existingStage = stageMap.get(row.etapa_id);
    const stage = ensureStage(
      stageMap,
      row.etapa_id,
      row.etapa_codigo,
      row.etapa_nombre,
      row.categoria,
      row.etapa_orden ?? Number.MAX_SAFE_INTEGER,
      stageMetadatos,
      existingStage?.tableroId,
    );
    stage.tarjetas.push(tarjeta);

    let createdVia: string | undefined;
    if (tarjeta.metadata && typeof tarjeta.metadata === "object" && !Array.isArray(tarjeta.metadata)) {
      const record = tarjeta.metadata as Record<string, unknown>;
      createdVia = typeof record.created_via === "string" ? record.created_via : undefined;
    }

    const isManualLead = createdVia === "embudo_manual";

    if (!row.conversacion_id && !isManualLead) {
      sinConversacion.push(tarjeta);
    }
  }

  for (const stage of stageMap.values()) {
    stage.tarjetas.sort((a, b) => (b.actualizadoEn ? Date.parse(b.actualizadoEn) : 0) - (a.actualizadoEn ? Date.parse(a.actualizadoEn) : 0));
  }

  const orderedStages = Array.from(stageMap.values()).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"));

  sinConversacion.sort((a, b) => (b.actualizadoEn ? Date.parse(b.actualizadoEn) : 0) - (a.actualizadoEn ? Date.parse(a.actualizadoEn) : 0));

  return { stages: orderedStages, sinConversacion };
}

function ensureStage(
  map: Map<string, EmbudoStage>,
  id: string,
  codigo: string,
  nombre: string,
  categoria: string,
  orden: number,
  metadatos: Record<string, unknown>,
  tableroId?: string,
): EmbudoStage {
  if (!map.has(id)) {
    map.set(id, {
      id,
      nombre,
      codigo,
      categoria,
      orden,
      tableroId: tableroId ?? "",
      metadatos,
      tarjetas: [],
    });
  } else {
    const stage = map.get(id)!;
    stage.nombre = nombre;
    stage.codigo = codigo;
    stage.categoria = categoria;
    stage.orden = orden;
    if (tableroId && !stage.tableroId) {
      stage.tableroId = tableroId;
    }
    if (Object.keys(metadatos).length) {
      stage.metadatos = metadatos;
    }
  }
  return map.get(id)!;
}
