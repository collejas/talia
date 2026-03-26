"use server";

import type { LeadCards, LeadChartPoint } from "@/lib/leads/data";
import type { DataTableRow } from "@/components/data-table";
import { callCrmApi } from "@/lib/api/crm";
import type { ClienteRecord, ClienteResponsable } from "@/types/clientes";

const DEFAULT_LIMIT = 200;

type CRMClientesResponse = {
  items: ClienteRecord[];
  limit: number;
  offset: number;
};

export type ClientesPayload = {
  cards: LeadCards;
  chart: LeadChartPoint[];
  table: DataTableRow[];
  errors: string[];
  totalRows: number;
};

export async function loadClientesData(): Promise<ClientesPayload> {
  const errors: string[] = [];

  const response = await callCrmApi<CRMClientesResponse>("/crm/clientes", {
    searchParams: {
      limit: String(DEFAULT_LIMIT),
      offset: "0",
    },
    withUserToken: true,
  });

  if (!response.ok) {
    errors.push(response.error);
  }

  const rows: ClienteRecord[] =
    response.ok && Array.isArray(response.data.items)
      ? response.data.items.map(sanitizeClienteRecord)
      : [];

  const cards = mapCards(rows);
  const chart = mapChart(rows);
  const table = mapTable(rows);

  return {
    cards,
    chart,
    table,
    errors,
    totalRows: rows.length,
  };
}

function sanitizeClienteRecord(record: ClienteRecord): ClienteRecord {
  const datosFacturacion = isPlainObject(record.datos_facturacion)
    ? record.datos_facturacion
    : null;
  const metadatos = isPlainObject(record.metadatos) ? record.metadatos : null;
  const documentos = Array.isArray(record.documentos) ? record.documentos : [];
  const responsables = Array.isArray(record.responsables) ? record.responsables : [];
  const estado = resolveEstadoOnboarding(record.estado_onboarding);
  return {
    ...record,
    datos_facturacion: datosFacturacion,
    metadatos,
    documentos,
    responsables,
    estado_onboarding: estado,
  };
}

function mapCards(rows: ClienteRecord[]): LeadCards {
  const total = rows.length;
  const completados = rows.filter((row) => row.estado_onboarding === "completado").length;
  const pendientes = rows.filter((row) => row.estado_onboarding !== "completado").length;
  const nuevas = rows.filter((row) => isWithinDays(row.creado_en, 7)).length;
  const montoTotal = rows.reduce((acc, row) => acc + (Number(row.monto_estimado) || 0), 0);

  return {
    total,
    abiertas: pendientes,
    ganadas: completados,
    perdidas: Math.max(total - completados - pendientes, 0),
    nuevas,
    montoTotal,
    topVendedor: undefined,
  };
}

function mapChart(rows: ClienteRecord[]): LeadChartPoint[] {
  const buckets = new Map<string, LeadChartPoint>();

  const ensureBucket = (date: string | null | undefined) => {
    const normalized = normalizeDate(date);
    if (!buckets.has(normalized)) {
      buckets.set(normalized, { date: normalized, nuevos: 0, ganados: 0, perdidos: 0 });
    }
    return buckets.get(normalized)!;
  };

  rows.forEach((row) => {
    const createdBucket = ensureBucket(row.creado_en);
    createdBucket.nuevos += 1;

    if (row.estado_onboarding === "completado") {
      const completedBucket = ensureBucket(row.actualizado_en || row.ganado_en || row.creado_en);
      completedBucket.ganados += 1;
    } else if (row.estado_onboarding === "pendiente") {
      createdBucket.perdidos += 1;
    }
  });

  return Array.from(buckets.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function mapTable(rows: ClienteRecord[]): DataTableRow[] {
  return rows.map((row, index) => {
    const header = row.razon_social || row.contacto?.nombre_completo || "Cliente sin nombre";
    const principal = resolvePrincipal(row.responsables);
    const reviewer = principal?.nombre || row.contacto?.nombre_completo || "Sin responsable";
    const status = formatStatus(row.estado_onboarding);

    return {
      id: index + 1,
      header,
      type: status,
      status,
      target: formatCurrency(row.monto_estimado, row.moneda || "MXN"),
      limit: row.contacto?.correo || "—",
      reviewer,
      raw: {
        cliente_id: row.id,
        rfc: row.rfc,
        estado: row.estado_onboarding,
        contacto_id: row.contacto_id,
      },
    };
  });
}

function resolvePrincipal(responsables: ClienteRecord["responsables"]): ClienteResponsable | undefined {
  if (!Array.isArray(responsables)) return undefined;
  return responsables.find((responsable) => responsable.es_responsable_principal) || responsables[0];
}

function formatStatus(value: string | null | undefined): string {
  if (!value) return "Pendiente";
  if (value === "en_progreso") return "En progreso";
  if (value === "completado") return "Completado";
  return "Pendiente";
}

function formatCurrency(value: number | null | undefined, currency = "MXN"): string {
  if (value == null || Number.isNaN(value)) return "—";
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return value.toLocaleString("es-MX");
  }
}

function normalizeDate(value: string | null | undefined): string {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }
  return value.slice(0, 10);
}

function isWithinDays(date: string | null | undefined, days: number): boolean {
  if (!date) return false;
  const parsed = Date.parse(date);
  if (Number.isNaN(parsed)) return false;
  const diff = Date.now() - parsed;
  return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000;
}

function resolveEstadoOnboarding(
  value: unknown,
): ClienteRecord["estado_onboarding"] {
  if (value === "pendiente" || value === "en_progreso" || value === "completado") {
    return value;
  }
  return "completado";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
