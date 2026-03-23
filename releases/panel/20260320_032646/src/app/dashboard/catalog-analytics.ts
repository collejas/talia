import { callCrmApi } from "@/lib/api/crm";

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

  const searchParams: Record<string, string> = { mes_desde: desde, mes_hasta: hasta };
  if (moneda) searchParams.moneda = moneda.toUpperCase();

  const response = await callCrmApi<{ rows?: CatalogSalesRow[] }>("/crm/analytics/catalog/ventas", {
    searchParams,
    withUserToken: true,
  });

  if (!response.ok) {
    throw new Error(response.error);
  }

  return Array.isArray(response.data?.rows) ? (response.data.rows as CatalogSalesRow[]) : [];
}

export async function fetchCatalogPipelineKpi(): Promise<CatalogPipelineRow[]> {
  const response = await callCrmApi<{ rows?: CatalogPipelineRow[] }>("/crm/analytics/catalog/embudo", {
    withUserToken: true,
  });
  if (!response.ok) {
    throw new Error(response.error);
  }
  return Array.isArray(response.data?.rows) ? (response.data.rows as CatalogPipelineRow[]) : [];
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
