"use server";

import type { DataTableRow } from "@/components/data-table";
import { callCrmApi } from "@/lib/api/crm";

type CRMOpportunityContact = {
  id: string;
  nombre_completo: string | null;
  correo: string | null;
  telefono_e164: string | null;
  company_name?: string | null;
};

type CRMOpportunityStage = {
  id: string;
  nombre: string;
  codigo: string | null;
  categoria: string | null;
  orden: number | null;
  metadata?: Record<string, unknown> | null;
};

type CRMOpportunityUser = {
  id: string;
  nombre_completo: string | null;
  correo: string | null;
  telefono_e164: string | null;
};

type CRMOpportunityAccount = {
  id: string;
  nombre: string | null;
  telefono: string | null;
  correo: string | null;
};

type CRMOpportunity = {
  id: string;
  cuenta_id: string | null;
  contacto_principal_id: string | null;
  contacto?: CRMOpportunityContact | null;
  cuenta?: CRMOpportunityAccount | null;
  etapa?: CRMOpportunityStage | null;
  etapa_id: string;
  titulo: string;
  descripcion: string | null;
  monto_estimado: number | null;
  moneda: string;
  probabilidad: number | null;
  fecha_cierre_probable: string | null;
  estado: string;
  motivo_perdida: string | null;
  propietario_usuario_id: string | null;
  asignado_a_usuario_id: string | null;
  asignado?: CRMOpportunityUser | null;
  metadata: Record<string, unknown> | null;
  creado_en: string;
  actualizado_en: string;
  cerrado_en: string | null;
};

type CRMOpportunitiesResponse = {
  items: CRMOpportunity[];
  limit: number;
  offset: number;
};

export type CrmOpportunitiesPayload = {
  rows: DataTableRow[];
  total: number;
  errors: string[];
};

type LoadCrmOpportunitiesOptions = {
  contactId?: string;
  contactoId?: string;
  etapaId?: string;
  estado?: string;
  asignadoId?: string;
  cuentaId?: string;
  canal?: string;
  q?: string;
  montoMin?: string;
  montoMax?: string;
  cierreDesde?: string;
  cierreHasta?: string;
  creadoDesde?: string;
  creadoHasta?: string;
  reinicioMin?: string;
};

export async function loadCrmOpportunities(
  options: LoadCrmOpportunitiesOptions = {},
): Promise<CrmOpportunitiesPayload> {
  const searchParams: Record<string, string> = { limit: "100", offset: "0" };
  const contactId = options.contactId ?? options.contactoId;
  if (contactId && contactId.trim().length && contactId !== "all") {
    searchParams.persona_id = contactId.trim();
    searchParams.contacto_id = contactId.trim();
  }
  if (options.etapaId && options.etapaId !== "all") searchParams.etapa_id = options.etapaId;
  if (options.estado && options.estado !== "all") searchParams.estado = options.estado;
  if (options.asignadoId && options.asignadoId !== "all") searchParams.asignado_id = options.asignadoId;
  if (options.cuentaId && options.cuentaId !== "all") searchParams.cuenta_id = options.cuentaId;
  if (options.canal && options.canal !== "all") searchParams.canal = options.canal;
  if (options.q) searchParams.q = options.q;
  if (options.montoMin) searchParams.monto_min = options.montoMin;
  if (options.montoMax) searchParams.monto_max = options.montoMax;
  if (options.cierreDesde) searchParams.cierre_desde = options.cierreDesde;
  if (options.cierreHasta) searchParams.cierre_hasta = options.cierreHasta;
  if (options.creadoDesde) searchParams.creado_desde = options.creadoDesde;
  if (options.creadoHasta) searchParams.creado_hasta = options.creadoHasta;
  if (options.reinicioMin) searchParams.reinicio_min = options.reinicioMin;

  const response = await callCrmApi<CRMOpportunitiesResponse>("/crm/oportunidades", {
    searchParams,
  });

  if (!response.ok) {
    return { rows: [], total: 0, errors: [response.error] };
  }

  const rows = response.data.items.map<DataTableRow>((op, index) => {
    const contactLabel = buildContactLabel(op);
    const restartSequence = extractRestartSequence(op.metadata);
    const stageLabel = formatEtapa(op);
    const statusLabel =
      restartSequence > 1 ? `${stageLabel} · Reinicio #${restartSequence}` : stageLabel;
    const assignedLabel =
      op.asignado?.nombre_completo?.trim() ||
      op.asignado_a_usuario_id ||
      "Sin asignar";

    return {
      id: index + 1,
      header: op.titulo || contactLabel || "Oportunidad sin nombre",
      type: contactLabel || op.estado || "Contacto sin nombre",
      status: statusLabel,
      target: formatCurrency(op.monto_estimado, op.moneda),
      limit: op.fecha_cierre_probable || "Sin fecha",
      reviewer: assignedLabel,
      raw: {
        ...op,
        restartSequence,
        status_meta: {
          label: statusLabel,
          variant: "outline",
        },
      },
    };
  });

  return {
    rows,
    total: response.data.items.length,
    errors: [],
  };
}

function formatEtapa(op: CRMOpportunity): string {
  if (op.etapa?.nombre && op.etapa.nombre.trim().length) {
    return op.etapa.nombre.trim();
  }
  const metadata = op.metadata;
  if (metadata && typeof metadata === "object") {
    const stageName = metadata.etapa_nombre;
    if (typeof stageName === "string" && stageName.trim().length) {
      return stageName;
    }
  }
  return `Etapa ${op.etapa_id.slice(0, 8)}`;
}

function buildContactLabel(op: CRMOpportunity): string {
  const contactName = op.contacto?.nombre_completo || op.metadata?.contacto_nombre;
  if (typeof contactName === "string" && contactName.trim().length) {
    return contactName.trim();
  }
  if (op.cuenta?.nombre && op.cuenta.nombre.trim().length) {
    return op.cuenta.nombre.trim();
  }
  if (op.contacto_principal_id) {
    return `Contacto ${op.contacto_principal_id.slice(0, 8)}`;
  }
  return "Contacto sin nombre";
}

function extractRestartSequence(metadata: Record<string, unknown> | null | undefined): number {
  if (metadata && typeof metadata.restart_sequence !== "undefined") {
    const value = Number(metadata.restart_sequence);
    if (!Number.isNaN(value) && value > 0) {
      return value;
    }
  }
  return 1;
}

function formatCurrency(value: number | null, currency: string): string {
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
