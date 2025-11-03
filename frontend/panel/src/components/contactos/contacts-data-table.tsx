"use client";

import * as React from "react";
import type { ColumnDef, VisibilityState } from "@tanstack/react-table";
import { z } from "zod";

import { DataTable, schema } from "@/components/data-table";
import type { ContactTableRow } from "@/lib/contactos/data";

type TableRow = z.infer<typeof schema>;

type ContactField =
  | "correo"
  | "telefono"
  | "origen"
  | "estado"
  | "captura_estado"
  | "company_name"
  | "ultimo_contacto_en"
  | "conversaciones"
  | "notes";

const DATE_FORMATTER = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
});

function getRawValue(row: TableRow, key: ContactField): unknown {
  const raw = row.raw as Record<string, unknown> | undefined;
  if (!raw) return null;
  return raw[key] ?? null;
}

function formatDate(value: unknown): string {
  if (typeof value !== "string") return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return DATE_FORMATTER.format(date);
}

function formatNumber(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString("es-MX");
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString("es-MX") : "—";
}

function renderField(row: TableRow, key: ContactField): React.ReactNode {
  const value = getRawValue(row, key);
  if (value === null || value === undefined || value === "") return <span className="text-muted-foreground">—</span>;

  switch (key) {
    case "correo":
      return (
        <a
          href={`mailto:${value}`}
          className="text-primary underline-offset-2 hover:underline"
        >
          {String(value)}
        </a>
      );
    case "telefono":
      return (
        <a
          href={`tel:${value}`}
          className="text-primary underline-offset-2 hover:underline"
        >
          {String(value)}
        </a>
      );
    case "ultimo_contacto_en":
      return (
        <span className="whitespace-nowrap" suppressHydrationWarning>
          {formatDate(value)}
        </span>
      );
    case "conversaciones":
      return <span className="tabular-nums">{formatNumber(value)}</span>;
    default:
      return <span className="break-words">{String(value)}</span>;
  }
}

const CONTACT_COLUMNS: Array<{
  id: string;
  label: string;
  accessor: (row: TableRow) => React.ReactNode;
  defaultVisible?: boolean;
}> = [
  {
    id: "contact_correo",
    label: "Correo",
    accessor: (row) => renderField(row, "correo"),
    defaultVisible: true,
  },
  {
    id: "contact_telefono",
    label: "Teléfono",
    accessor: (row) => renderField(row, "telefono"),
    defaultVisible: true,
  },
  {
    id: "contact_origen",
    label: "Origen",
    accessor: (row) => renderField(row, "origen"),
    defaultVisible: true,
  },
  {
    id: "contact_estado",
    label: "Estado",
    accessor: (row) => renderField(row, "estado"),
  },
  {
    id: "contact_captura",
    label: "Captura",
    accessor: (row) => renderField(row, "captura_estado"),
  },
  {
    id: "contact_company",
    label: "Empresa",
    accessor: (row) => renderField(row, "company_name"),
  },
  {
    id: "contact_ultimo",
    label: "Último contacto",
    accessor: (row) => renderField(row, "ultimo_contacto_en"),
    defaultVisible: true,
  },
  {
    id: "contact_conversaciones",
    label: "Conversaciones",
    accessor: (row) => renderField(row, "conversaciones"),
  },
  {
    id: "contact_notes",
    label: "Notas",
    accessor: (row) => renderField(row, "notes"),
  },
];

const contactExtraColumns: ColumnDef<TableRow>[] = CONTACT_COLUMNS.map((column) => ({
  id: column.id,
  header: column.label,
  accessorFn: () => null,
  cell: ({ row }) => column.accessor(row.original),
  enableHiding: true,
  enableSorting: false,
  meta: { label: column.label },
}));

const contactColumnVisibility: VisibilityState = CONTACT_COLUMNS.reduce<VisibilityState>(
  (visibility, column) => {
    visibility[column.id] = column.defaultVisible ?? false;
    return visibility;
  },
  {},
);

export function ContactsDataTable({ data }: { data: ContactTableRow[] }) {
  return (
    <DataTable
      data={data}
      extraColumns={contactExtraColumns}
      initialVisibility={contactColumnVisibility}
      storageKey="contacts-table-column-order"
    />
  );
}
