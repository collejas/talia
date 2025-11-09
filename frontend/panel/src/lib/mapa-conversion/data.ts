"use server";

import { callSupabaseRpc } from "@/lib/leads/supabase";

type RpcCounterRow = { total: number | string | null | undefined };

type GeoItem = {
  cve_ent?: string | null;
  nombre?: string | null;
  total?: number | string | null;
  por_canal?: Record<string, number | string | null> | null;
};

type GeoResponse = {
  totals?: Record<string, number | string | null>;
  items?: GeoItem[] | null;
};

type GeoMunicipioItem = {
  cvegeo?: string | null;
  nombre?: string | null;
  total?: number | string | null;
  por_canal?: Record<string, number | string | null> | null;
};

type GeoMunicipioResponse = {
  items?: GeoMunicipioItem[] | null;
};

type WebchatDetailRow = {
  total_rows?: number | string | null;
  total_chat_rows?: number | string | null;
  total_no_chat_rows?: number | string | null;
};

export type MapaConversionKpis = {
  visitantesSinChat: number;
  totalVisitasWebchat: number;
  whatsappGeolocalizados: number;
  webchatLeads: number;
  webchatChats: number;
  webchatConversionRate: number;
  topEstado?: {
    code: string;
    nombre?: string;
    total: number;
  };
  topMunicipio?: {
    cvegeo: string;
    nombre?: string;
    total: number;
  };
};

function toNumber(input: number | string | null | undefined): number {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input === "string" && input.trim().length) {
    const parsed = Number.parseFloat(input);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export async function loadMapaConversionKpis(): Promise<MapaConversionKpis> {
  const [visitantesResult, whatsappGeoResult, webchatGeoResult, webchatDetalleResult] =
    await Promise.all([
      callSupabaseRpc<RpcCounterRow[] | RpcCounterRow>("embudo_visitantes_contador", {
        body: { p_closed_after: null, p_closed_before: null },
      }),
      callSupabaseRpc<GeoResponse>("panel_leads_geo_estados", {
        body: { p_canales: "whatsapp" },
      }),
      callSupabaseRpc<GeoResponse>("panel_leads_geo_estados", {
        body: { p_canales: "webchat" },
      }),
      callSupabaseRpc<WebchatDetailRow[]>("panel_webchat_visitas_detalle", {
        body: {
          p_limit: 1,
          p_offset: 0,
          p_order_by: "primera",
          p_order_dir: "asc",
        },
      }),
    ]);

  // Visitantes sin chat
  let visitantesSinChat = 0;
  if (visitantesResult.ok) {
    const payload = visitantesResult.data;
    const row = Array.isArray(payload) ? payload[0] : payload;
    visitantesSinChat = toNumber(row?.total);
  }

  // WhatsApp geolocalizados y top estado
  let whatsappGeolocalizados = 0;
  let topEstado: MapaConversionKpis["topEstado"];
  if (whatsappGeoResult.ok && whatsappGeoResult.data) {
    const geoData = whatsappGeoResult.data;
    const items = Array.isArray(geoData.items) ? geoData.items : [];
    let bestItem: GeoItem | undefined;
    let bestCount = 0;
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const porCanal = item.por_canal ?? {};
      const whatsappCount = toNumber(porCanal?.whatsapp);
      const fallbackTotal = toNumber(item.total);
      const effectiveTotal = whatsappCount || fallbackTotal;
      if (effectiveTotal > 0) {
        whatsappGeolocalizados += effectiveTotal;
        if (effectiveTotal > bestCount) {
          bestCount = effectiveTotal;
          bestItem = item;
        }
      }
    }
    if (bestItem) {
      const code = (bestItem.cve_ent ?? "").padStart(2, "0");
      topEstado = {
        code,
        nombre: typeof bestItem.nombre === "string" ? bestItem.nombre : undefined,
        total: bestCount,
      };
    }
  }

  // Conversión webchat → lead
  let webchatLeads = 0;
  if (webchatGeoResult.ok && webchatGeoResult.data) {
    const totals = webchatGeoResult.data.totals ?? {};
    webchatLeads = toNumber(totals?.total);
  }

  let webchatChats = 0;
  let totalVisitasWebchat = 0;
  if (webchatDetalleResult.ok && Array.isArray(webchatDetalleResult.data)) {
    const row = webchatDetalleResult.data[0];
    if (row) {
      webchatChats = toNumber(row.total_chat_rows);
      const sinChat = toNumber(row.total_no_chat_rows);
      totalVisitasWebchat = webchatChats + sinChat;
    }
  }

  const webchatConversionRate =
    webchatChats > 0 ? Number.parseFloat(((webchatLeads / webchatChats) * 100).toFixed(2)) : 0;

  // Top municipio (usando el estado destacado si existe)
  let topMunicipio: MapaConversionKpis["topMunicipio"];
  if (topEstado) {
    const municipiosResult = await callSupabaseRpc<GeoMunicipioResponse>(
      "panel_leads_geo_municipios",
      {
        body: { p_estado: topEstado.code, p_canales: "whatsapp" },
      },
    );
    if (municipiosResult.ok && municipiosResult.data) {
      const items = Array.isArray(municipiosResult.data.items) ? municipiosResult.data.items : [];
      let bestMunicipio: GeoMunicipioItem | undefined;
      let bestMunicipioTotal = 0;
      for (const item of items) {
        if (!item) continue;
        const porCanal = item.por_canal ?? {};
        const whatsappCount = toNumber(porCanal?.whatsapp);
        const fallbackTotal = toNumber(item.total);
        const effectiveTotal = whatsappCount || fallbackTotal;
        if (effectiveTotal > bestMunicipioTotal) {
          bestMunicipioTotal = effectiveTotal;
          bestMunicipio = item;
        }
      }
      if (bestMunicipio && bestMunicipioTotal > 0) {
        topMunicipio = {
          cvegeo: (bestMunicipio.cvegeo ?? "").padStart(5, "0"),
          nombre: typeof bestMunicipio.nombre === "string" ? bestMunicipio.nombre : undefined,
          total: bestMunicipioTotal,
        };
      }
    }
  }

  return {
    visitantesSinChat,
    totalVisitasWebchat,
    whatsappGeolocalizados,
    webchatLeads,
    webchatChats,
    webchatConversionRate,
    topEstado,
    topMunicipio,
  };
}
