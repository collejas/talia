import { getPanelApiBaseUrl } from "@/lib/api/panel";
import { resolvePanelApiToken } from "@/lib/auth/panel-token";

export type CatalogSalesRow = {
  mes: string;
  catalog_item_id: string | null;
  item_nombre: string | null;
  moneda: string | null;
  total_vendido: number | null;
  unidades_vendidas: number | null;
  leads_ganados: number | null;
};

export type CatalogPipelineRow = {
  tablero_id: string | null;
  etapa_id: string | null;
  catalog_item_id: string | null;
  item_nombre: string | null;
  moneda: string | null;
  monto_estimado: number | null;
  leads_con_cotizacion: number | null;
};

type SalesOptions = {
  months?: number;
  moneda?: string | null;
};

export async function fetchCatalogSalesKpi(options?: SalesOptions): Promise<CatalogSalesRow[]> {
  const { months = 6, moneda } = options || {};
  const now = new Date();
  const desde = formatMonth(addMonths(now, -months + 1));
  const hasta = formatMonth(now);

  const params = new URLSearchParams({ mes_desde: desde, mes_hasta: hasta });
  if (moneda) params.set("moneda", moneda.toUpperCase());

  const payload = await fetchPanelApi(`/analytics/catalog/ventas?${params.toString()}`);
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  return rows as CatalogSalesRow[];
}

export async function fetchCatalogPipelineKpi(): Promise<CatalogPipelineRow[]> {
  const payload = await fetchPanelApi("/analytics/catalog/embudo");
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  return rows as CatalogPipelineRow[];
}

async function fetchPanelApi(path: string): Promise<Record<string, unknown> | null> {
  const token = await resolvePanelApiToken();
  const baseUrl = getPanelApiBaseUrl();
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  const text = await response.text();
  const payload = text ? safeJson(text) : null;
  if (!response.ok) {
    const detail =
      (payload && typeof payload.detail === "string" && payload.detail) ||
      (payload && typeof payload.error === "string" && payload.error) ||
      text ||
      "Error consultando analytics";
    throw new Error(detail);
  }
  return payload;
}

function safeJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function formatMonth(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}
