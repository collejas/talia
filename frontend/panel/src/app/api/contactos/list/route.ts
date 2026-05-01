import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

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

type ContactTableRow = {
  id: number;
  header: string;
  type: string;
  status: string;
  target: string;
  limit: string;
  reviewer: string;
  raw?: Record<string, unknown>;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim() || "";
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") || "200")));

  const response = await callCrmApi<CrmContactListRow[]>("/crm/contacts/list", {
    method: "GET",
    searchParams: {
      limit: String(limit),
      ...(search ? { search } : {}),
    },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: response.error || "contacts_list_failed" },
      { status: response.status ?? 502 },
    );
  }

  const rows = Array.isArray(response.data) ? response.data : [];
  const items = rows.map((row, index): ContactTableRow => {
    const captureDone = (row.captura_estado || "").toLowerCase() === "completo";
    const conversations = Number.isFinite(row.conversaciones) ? Number(row.conversaciones) : 0;
    const lastContact =
      row.ultimo_contacto_en && !Number.isNaN(Date.parse(row.ultimo_contacto_en))
        ? new Date(row.ultimo_contacto_en).toISOString()
        : "";

    return {
      id: index + 1,
      header: row.nombre?.trim() || "Contacto sin nombre",
      type: normalizeLabel(row.estado) || "Desconocido",
      status: captureDone ? "Done" : "In Process",
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

  const totalRows = rows.length ? rows[0].total_rows ?? rows.length : 0;
  return NextResponse.json({ items, totalRows });
}

function normalizeLabel(value: string | null | undefined): string {
  if (!value) return "Desconocido";
  const trimmed = value.trim();
  return trimmed.length ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : "Desconocido";
}
