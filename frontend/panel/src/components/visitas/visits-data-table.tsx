"use client";

import * as React from "react";
import type { Column, ColumnDef, VisibilityState } from "@tanstack/react-table";
import { z } from "zod";
import { IconChevronDown, IconChevronUp, IconArrowsUpDown } from "@tabler/icons-react";

import { DataTable, schema } from "@/components/data-table";
import type { VisitDetailRaw, VisitTableRow } from "@/lib/visitas/data";
import { formatWaLabel } from "@/lib/visitas/formatting";

type TableRow = z.infer<typeof schema>;

type FieldType = "string" | "code" | "number" | "boolean" | "datetime" | "json";

type VisitField = {
  id: string;
  key: keyof VisitDetailRaw;
  label: string;
  type: FieldType;
  defaultVisible?: boolean;
  format?: (value: unknown) => React.ReactNode;
};

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Mexico_City",
});

const DASH = <span className="text-muted-foreground">—</span>;

function formatContactOrigin(value: unknown) {
  const cleaned = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!cleaned) return DASH;
  return cleaned
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getRawValue(row: TableRow, key: keyof VisitDetailRaw) {
  const raw = row.raw as VisitDetailRaw | undefined;
  if (!raw) return null;
  if (key === "state_name" && raw.canal === "whatsapp") {
    const phoneLocation = raw.phone_location as
      | {
          ok?: boolean | null;
          municipality_name?: string | null;
          state_name?: string | null;
        }
      | null
      | undefined;
    const derivedLocation =
      (raw.city_name || raw.nom_mun || phoneLocation?.municipality_name || null) ||
      (raw.state_name || raw.nom_ent || phoneLocation?.state_name || null);
    if (phoneLocation && phoneLocation.ok === false) {
      return "Ubicación no resuelta";
    }
    if (derivedLocation && derivedLocation !== raw.country_name) {
      return derivedLocation;
    }
  }
  return raw[key] ?? null;
}

function renderValue(value: unknown, type: FieldType) {
  if (value === null || value === undefined || value === "") {
    return DASH;
  }

  switch (type) {
    case "code":
      return (
        <code className="rounded bg-muted px-1 py-0.5 text-xs">
          {String(value)}
        </code>
      );
    case "number": {
      if (typeof value === "number" && Number.isFinite(value)) {
        return value.toLocaleString("es-MX");
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed.toLocaleString("es-MX") : String(value);
    }
    case "boolean": {
      if (value === true) return "Sí";
      if (value === false) return "No";
      const lowered = typeof value === "string" ? value.toLowerCase() : "";
      if (["true", "1"].includes(lowered)) return "Sí";
      if (["false", "0"].includes(lowered)) return "No";
      return DASH;
    }
    case "datetime": {
      if (typeof value !== "string") return String(value);
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return <span>{value}</span>;
      }
      const formatted = DATE_TIME_FORMATTER.format(date);
      return (
        <span className="whitespace-nowrap" suppressHydrationWarning>
          {formatted}
        </span>
      );
    }
    case "json": {
      let printable: string;
      if (typeof value === "string") {
        try {
          printable = JSON.stringify(JSON.parse(value), null, 2);
        } catch {
          printable = value;
        }
      } else {
        try {
          printable = JSON.stringify(value, null, 2) ?? String(value);
        } catch {
          printable = String(value);
        }
      }
      return (
        <pre className="max-h-40 w-full overflow-auto rounded bg-muted/50 px-2 py-1 text-xs leading-snug">
          {printable}
        </pre>
      );
    }
    default:
      return <span className="break-words">{String(value)}</span>;
  }
}

const VISIT_FIELDS: VisitField[] = [
  { id: "registrado_en", key: "registrado_en", label: "Creado", type: "datetime", defaultVisible: true },
  { id: "prospeccion_campana_nombre", key: "prospeccion_campana_nombre", label: "Promoción de prospección", type: "string", defaultVisible: true },
  { id: "prospeccion_batch_label", key: "prospeccion_batch_label", label: "Lote Prospección", type: "string", defaultVisible: true },
  { id: "prospeccion_campana_tipo", key: "prospeccion_campana_tipo", label: "Tipo de promoción", type: "string", defaultVisible: true },
  {
    id: "wa_canal_publicitario",
    key: "wa_canal_publicitario",
    label: "Canal WA",
    type: "string",
    defaultVisible: true,
    format: (value) => formatWaLabel(value) ?? DASH,
  },
  {
    id: "wa_campana_publicitaria",
    key: "wa_campana_publicitaria",
    label: "Promoción de WhatsApp",
    type: "string",
    defaultVisible: true,
    format: (value) => formatWaLabel(value) ?? DASH,
  },
  { id: "wa_regla_nombre", key: "wa_regla_nombre", label: "Regla WA", type: "string", defaultVisible: true },
  { id: "wa_regla_frase", key: "wa_regla_frase", label: "Frase WA", type: "string" },
  { id: "ip", key: "ip", label: "IP", type: "string" },
  { id: "primera_visita_en", key: "primera_visita_en", label: "Primera visita", type: "datetime" },
  { id: "ultimo_evento_en", key: "ultimo_evento_en", label: "Último evento", type: "datetime" },
  { id: "closed_at", key: "closed_at", label: "Cierre", type: "datetime" },
  { id: "stay_seconds", key: "stay_seconds", label: "Duración (s)", type: "number" },
  { id: "mensajes_entrantes", key: "mensajes_entrantes", label: "Mensajes entrantes", type: "number" },
  { id: "mensajes_salientes", key: "mensajes_salientes", label: "Mensajes salientes", type: "number" },
  { id: "primer_mensaje_en", key: "primer_mensaje_en", label: "Primer mensaje", type: "datetime" },
  { id: "ultimo_mensaje_conversacion", key: "ultimo_mensaje_conversacion", label: "Último mensaje", type: "datetime" },
  { id: "contacto_id", key: "contacto_id", label: "Contacto ID", type: "code" },
  { id: "contacto_nombre", key: "contacto_nombre", label: "Contacto", type: "string", defaultVisible: true },
  {
    id: "contacto_origen",
    key: "contacto_origen",
    label: "Origen contacto",
    type: "string",
    defaultVisible: true,
    format: (value) => formatContactOrigin(value),
  },
  { id: "correo_envio", key: "correo_envio", label: "Correo prospección", type: "string", defaultVisible: true },
  { id: "contacto_telefono", key: "contacto_telefono", label: "Contacto teléfono", type: "string" },
  { id: "contacto_empresa", key: "contacto_empresa", label: "Empresa", type: "string" },
  { id: "contacto_estado", key: "contacto_estado", label: "Estado contacto", type: "string" },
  { id: "contacto_captura", key: "contacto_captura", label: "Captura", type: "string" },
  { id: "contacto_creado_en", key: "contacto_creado_en", label: "Contacto creado en", type: "datetime" },
  { id: "country_code", key: "country_code", label: "País código", type: "code" },
  { id: "country_name", key: "country_name", label: "País", type: "string" },
  { id: "state_name", key: "state_name", label: "Estado", type: "string" },
  { id: "state_code", key: "state_code", label: "Estado código", type: "code" },
  { id: "city_name", key: "city_name", label: "Ciudad", type: "string" },
  { id: "cve_ent", key: "cve_ent", label: "CVE Ent", type: "code" },
  { id: "nom_ent", key: "nom_ent", label: "Nombre Ent", type: "string" },
  { id: "cve_mun", key: "cve_mun", label: "CVE Mun", type: "code" },
  { id: "nom_mun", key: "nom_mun", label: "Nombre Mun", type: "string" },
  { id: "cvegeo", key: "cvegeo", label: "CVE Geo", type: "code" },
  { id: "device_type", key: "device_type", label: "Dispositivo", type: "string" },
  { id: "sistema_operativo", key: "sistema_operativo", label: "Sistema operativo", type: "string" },
  { id: "idioma", key: "idioma", label: "Idioma", type: "string" },
  { id: "timezone", key: "timezone", label: "Zona horaria", type: "string" },
  { id: "prefiere_modo_oscuro", key: "prefiere_modo_oscuro", label: "Prefiere modo oscuro", type: "boolean" },
  { id: "referrer", key: "referrer", label: "Sitio de origen", type: "string" },
  { id: "referrer_host", key: "referrer_host", label: "Sitio que envió la visita", type: "string", defaultVisible: true },
  { id: "landing_url", key: "landing_url", label: "Página de entrada", type: "string" },
  { id: "utm_source", key: "utm_source", label: "Origen de la promoción", type: "string", defaultVisible: true },
  { id: "utm_medium", key: "utm_medium", label: "Medio de la promoción", type: "string", defaultVisible: true },
  { id: "utm_campaign", key: "utm_campaign", label: "Nombre de la promoción", type: "string", defaultVisible: true },
  { id: "template_nombre", key: "template_nombre", label: "Plantilla captada", type: "string", defaultVisible: true },
  { id: "prospeccion_campana_id", key: "prospeccion_campana_id", label: "ID de promoción de prospección", type: "code" },
  { id: "prospeccion_batch_id", key: "prospeccion_batch_id", label: "Lote Prospección ID", type: "code" },
  { id: "template_captada", key: "template_captada", label: "Tiene plantilla", type: "boolean", defaultVisible: true },
  { id: "template_id", key: "template_id", label: "Template ID", type: "code" },
  { id: "template_slug", key: "template_slug", label: "Template Slug", type: "string" },
  { id: "ubicacion_cache", key: "ubicacion_cache", label: "Ubicación (JSON)", type: "json" },
  { id: "dispositivo_cache", key: "dispositivo_cache", label: "Dispositivo (JSON)", type: "json" },
  { id: "pantalla_cache", key: "pantalla_cache", label: "Pantalla (JSON)", type: "json" },
  { id: "trazabilidad_cache", key: "trazabilidad_cache", label: "Trazabilidad (JSON)", type: "json" },
  { id: "geo", key: "geo", label: "Geo (JSON)", type: "json" },
  { id: "total_rows", key: "total_rows", label: "Total filas", type: "number" },
  { id: "total_chat_rows", key: "total_chat_rows", label: "Total chat", type: "number" },
  { id: "total_no_chat_rows", key: "total_no_chat_rows", label: "Total sin chat", type: "number" },
];

const visitExtraColumns: ColumnDef<TableRow>[] = VISIT_FIELDS.map((field) => {
  const columnId = `visit_${field.id}`;
  return {
    id: columnId,
    header: ({ column }) => (
      <VisitColumnHeader column={column as Column<TableRow, unknown>} label={field.label} />
    ),
    accessorFn: (row) => getRawValue(row, field.key),
    cell: ({ getValue }) => (field.format ? field.format(getValue()) : renderValue(getValue(), field.type)),
    enableSorting: field.type !== "json",
    enableHiding: true,
    meta: { label: field.label },
  } satisfies ColumnDef<TableRow>;
});

const visitColumnVisibility: VisibilityState = VISIT_FIELDS.reduce<VisibilityState>(
  (acc, field) => {
    acc[`visit_${field.id}`] = field.defaultVisible ?? false;
    return acc;
  },
  {}
);

export function VisitsDataTable({ data }: { data: VisitTableRow[] }) {
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  if (!mounted) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
        Preparando tabla de visitas...
      </div>
    )
  }

  return (
    <DataTable
      data={data}
      extraColumns={visitExtraColumns}
      initialVisibility={visitColumnVisibility}
      storageKey="visits-table-column-order"
      columnLabels={{
        header: "Contacto",
        type: "Origen contacto",
        status: "Estado del chat",
        target: "Visitas registradas",
        reviewer: "Contacto asignado",
      }}
    />
  );
}

function VisitColumnHeader({ column, label }: { column: Column<TableRow, unknown>; label: string }) {
  const direction = column.getIsSorted();
  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      className="flex w-full items-center gap-1 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
    >
      <span>{label}</span>
      <span className="text-muted-foreground/70">
        {direction === "asc" ? (
          <IconChevronUp className="size-3" />
        ) : direction === "desc" ? (
          <IconChevronDown className="size-3" />
        ) : (
          <IconArrowsUpDown className="size-3" />
        )}
      </span>
    </button>
  );
}
