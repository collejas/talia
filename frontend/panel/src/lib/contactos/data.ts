"use server";

import { callCrmApi } from "@/lib/api/crm";
import type { ContactCards, ContactTableRow } from "@/lib/contactos/types";

type CrmContactSummary = {
  total?: number;
  completos?: number;
  incompletos?: number;
  activos?: number;
  leads?: number;
  webchat?: number;
  propietarios?: number;
  ultimo?: string | null;
};

type CrmContactListRow = {
  contacto_id: string;
  codigo_contacto: string | null;
  codigo_cuenta: string | null;
  nombre: string | null;
  correo: string | null;
  telefono: string | null;
  estado: string | null;
  captura_estado: string | null;
  origen: string | null;
  creado_en: string;
  actualizado_en: string | null;
  company_name: string | null;
  propietario_id: string | null;
  propietario_nombre: string | null;
  ultimo_contacto_en: string | null;
  conversaciones: number | null;
  notes: string | null;
  rfc: string | null;
  puesto: string | null;
  area: string | null;
  rol_decision: string | null;
  codigo_postal: string | null;
  entidad: string | null;
  municipio: string | null;
  pais: string | null;
  website: string | null;
  tipo_establecimiento: string | null;
  fecha_incorporacion: string | null;
  total_rows: number;
};

export type ContactosPayload = {
  cards: ContactCards;
  table: ContactTableRow[];
  totalRows: number;
  errors: string[];
};

const DEFAULT_LIMIT = 200;

export async function loadContactosData(): Promise<ContactosPayload> {
  const [resumen, listado] = await Promise.all([
    callCrmApi<CrmContactSummary>("/crm/contacts/summary"),
    callCrmApi<CrmContactListRow[]>("/crm/contacts/list", {
      searchParams: {
        limit: String(DEFAULT_LIMIT),
      },
    }),
  ]);

  const errors: string[] = [];
  if (!resumen.ok) errors.push(resumen.error);
  if (!listado.ok) errors.push(listado.error);

  const listRows = listado.ok ? listado.data : undefined;
  const cards = shouldUseSummary(resumen.ok ? resumen.data : undefined, listRows)
    ? mapCardsFromSummary(resumen.ok ? resumen.data : undefined)
    : mapCardsFromList(listRows);
  const table = mapTable(listRows);
  const totalRows =
    Array.isArray(listRows) && listRows.length
      ? listRows[0].total_rows ?? listRows.length
      : 0;

  return {
    cards,
    table,
    totalRows,
    errors: Array.from(new Set(errors)),
  };
}

function shouldUseSummary(payload: CrmContactSummary | undefined, rows: CrmContactListRow[] | undefined): boolean {
  if (!payload) return false;
  const hasSummaryValue =
    Number(payload.total ?? 0) > 0 ||
    Number(payload.completos ?? 0) > 0 ||
    Number(payload.incompletos ?? 0) > 0 ||
    Number(payload.activos ?? 0) > 0 ||
    Number(payload.leads ?? 0) > 0 ||
    Number(payload.webchat ?? 0) > 0 ||
    Number(payload.propietarios ?? 0) > 0 ||
    Boolean(payload.ultimo);
  if (hasSummaryValue) return true;
  return !rows || rows.length === 0;
}

function mapCardsFromSummary(payload?: CrmContactSummary): ContactCards {
  return {
    total: payload?.total ?? 0,
    completos: payload?.completos ?? 0,
    incompletos: payload?.incompletos ?? 0,
    activos: payload?.activos ?? 0,
    leads: payload?.leads ?? 0,
    webchat: payload?.webchat ?? 0,
    propietarios: payload?.propietarios ?? 0,
    ultimo: payload?.ultimo ?? null,
  };
}

function mapCardsFromList(payload?: CrmContactListRow[] | null): ContactCards {
  if (!payload || !payload.length) {
    return {
      total: 0,
      completos: 0,
      incompletos: 0,
      activos: 0,
      leads: 0,
      webchat: 0,
      propietarios: 0,
      ultimo: null,
    };
  }

  const counts = payload.reduce(
    (acc, row) => {
      const estado = normalizeLabel(row.estado).trim().toLowerCase();
      const captura = (row.captura_estado || "").trim().toLowerCase();
      const origen = (row.origen || "").trim().toLowerCase();
      if (captura === "completo") acc.completos += 1;
      else acc.incompletos += 1;
      if (estado === "activo") acc.activos += 1;
      if (estado === "lead") acc.leads += 1;
      if (origen === "webchat") acc.webchat += 1;
      if (row.propietario_id || row.propietario_nombre) {
        acc.propietarios.add(row.propietario_id || row.propietario_nombre || "");
      }
      const createdAt = row.creado_en && !Number.isNaN(Date.parse(row.creado_en)) ? new Date(row.creado_en).getTime() : null;
      if (createdAt !== null && (acc.ultimo === null || createdAt > acc.ultimo)) {
        acc.ultimo = createdAt;
      }
      return acc;
    },
    {
      completos: 0,
      incompletos: 0,
      activos: 0,
      leads: 0,
      webchat: 0,
      propietarios: new Set<string>(),
      ultimo: null as number | null,
    },
  );

  return {
    total: payload.length,
    completos: counts.completos,
    incompletos: counts.incompletos,
    activos: counts.activos,
    leads: counts.leads,
    webchat: counts.webchat,
    propietarios: counts.propietarios.size,
    ultimo: counts.ultimo ? new Date(counts.ultimo).toISOString() : null,
  };
}

function mapTable(payload?: CrmContactListRow[] | null): ContactTableRow[] {
  if (!payload || !payload.length) return [];
  return payload.map((row, index) => {
    const captureDone = (row.captura_estado || "").toLowerCase() === "completo";
    const status = captureDone ? "Done" : "In Process";
    const conversations = Number.isFinite(row.conversaciones) ? Number(row.conversaciones) : 0;
    const lastContact =
      row.ultimo_contacto_en && !Number.isNaN(Date.parse(row.ultimo_contacto_en))
        ? new Date(row.ultimo_contacto_en).toISOString()
        : "";

    return {
      id: index + 1,
      header: row.nombre?.trim() || row.company_name?.trim() || "Contacto sin nombre",
      type: normalizeLabel(row.estado) || "Desconocido",
      status,
      target: conversations.toString(),
      limit: lastContact,
      reviewer: row.propietario_nombre || "Sin asignar",
      raw: {
        contacto_id: row.contacto_id,
        codigo_contacto: row.codigo_contacto,
        codigo_cuenta: row.codigo_cuenta,
        correo: row.correo,
        telefono: row.telefono,
        estado: row.estado,
        captura_estado: row.captura_estado,
        origen: row.origen,
        creado_en: row.creado_en,
        actualizado_en: row.actualizado_en,
        company_name: row.company_name,
        propietario_id: row.propietario_id,
        propietario_nombre: row.propietario_nombre,
        ultimo_contacto_en: row.ultimo_contacto_en,
        conversaciones: conversations,
        notes: row.notes,
        rfc: row.rfc,
        puesto: row.puesto,
        area: row.area,
        rol_decision: row.rol_decision,
        codigo_postal: row.codigo_postal,
        entidad: row.entidad,
        municipio: row.municipio,
        pais: row.pais,
        website: row.website,
        tipo_establecimiento: row.tipo_establecimiento,
        fecha_incorporacion: row.fecha_incorporacion,
        status_meta: {
          label: captureDone ? "Completo" : "Incompleto",
          variant: captureDone ? "default" : "outline",
        },
        metric_meta: {
          value: conversations,
          formatted: conversations.toLocaleString("es-MX"),
        },
      },
    };
  });
}

function normalizeLabel(value: string | null | undefined): string {
  if (!value) return "Desconocido";
  const trimmed = value.trim();
  return trimmed.length ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : "Desconocido";
}
