"use client";

import type { ColumnDef } from "@tanstack/react-table";

import { DataTable, SortButton } from "@/components/data-table";
import type { DataTableRow } from "@/components/data-table";

function rawValue(row: DataTableRow, key: string): unknown {
  return row.raw?.[key];
}

function textValue(row: DataTableRow, key: string): string {
  const value = rawValue(row, key);
  return value == null || value === "" ? "—" : String(value);
}

function moneyValue(row: DataTableRow, key: string): string {
  const value = Number(rawValue(row, key));
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: String(rawValue(row, "moneda") || "MXN"),
    maximumFractionDigits: 2,
  }).format(value);
}

function dateValue(row: DataTableRow, key: string): string {
  const value = rawValue(row, key);
  if (typeof value !== "string" || !value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(date);
}

const clientColumns: ColumnDef<DataTableRow>[] = [
  {
    id: "telefono",
    accessorFn: (row) => textValue(row, "telefono"),
    header: ({ column }) => <SortButton column={column} label="Teléfono" />,
    cell: ({ row }) => textValue(row.original, "telefono"),
    meta: { label: "Teléfono" },
  },
  {
    id: "correo",
    accessorFn: (row) => textValue(row, "correo"),
    header: ({ column }) => <SortButton column={column} label="Correo" />,
    cell: ({ row }) => textValue(row.original, "correo"),
    meta: { label: "Correo" },
  },
  {
    id: "ultima_compra",
    accessorFn: (row) => String(rawValue(row, "ultima_compra_en") || ""),
    header: ({ column }) => <SortButton column={column} label="Última compra" />,
    cell: ({ row }) => dateValue(row.original, "ultima_compra_en"),
    meta: { label: "Última compra" },
  },
  {
    id: "ultimo_pago",
    accessorFn: (row) => String(rawValue(row, "ultimo_pago_en") || ""),
    header: ({ column }) => <SortButton column={column} label="Último pago" />,
    cell: ({ row }) => dateValue(row.original, "ultimo_pago_en"),
    meta: { label: "Último pago" },
  },
  {
    id: "proxima_actividad",
    accessorFn: (row) => String(rawValue(row, "proxima_actividad_en") || ""),
    header: ({ column }) => <SortButton column={column} label="Próxima actividad" />,
    cell: ({ row }) => dateValue(row.original, "proxima_actividad_en"),
    meta: { label: "Próxima actividad" },
  },
  {
    id: "estado_relacion",
    accessorFn: (row) => textValue(row, "estado_relacion"),
    header: ({ column }) => <SortButton column={column} label="Estado de relación" />,
    cell: ({ row }) => textValue(row.original, "estado_relacion"),
    meta: { label: "Estado de relación" },
  },
  {
    id: "empresa",
    accessorFn: (row) => textValue(row, "empresa_nombre"),
    header: ({ column }) => <SortButton column={column} label="Empresa" />,
    cell: ({ row }) => textValue(row.original, "empresa_nombre"),
    meta: { label: "Empresa" },
  },
  {
    id: "oportunidades",
    accessorFn: (row) => Number(rawValue(row, "numero_oportunidades_ganadas")) || 0,
    header: ({ column }) => <SortButton column={column} label="Oportunidades ganadas" />,
    cell: ({ row }) => <span className="tabular-nums">{textValue(row.original, "numero_oportunidades_ganadas")}</span>,
    meta: { label: "Oportunidades ganadas" },
  },
  {
    id: "cobrado",
    accessorFn: (row) => Number(rawValue(row, "total_cobrado")) || 0,
    header: ({ column }) => <SortButton column={column} label="Total cobrado" align="right" />,
    cell: ({ row }) => <div className="text-right tabular-nums">{moneyValue(row.original, "total_cobrado")}</div>,
    meta: { label: "Total cobrado" },
  },
  {
    id: "saldo",
    accessorFn: (row) => Number(rawValue(row, "saldo_pendiente")) || 0,
    header: ({ column }) => <SortButton column={column} label="Saldo pendiente" align="right" />,
    cell: ({ row }) => <div className="text-right tabular-nums">{moneyValue(row.original, "saldo_pendiente")}</div>,
    meta: { label: "Saldo pendiente" },
  },
];

export function ClientesTable({ rows }: { rows: DataTableRow[] }) {
  return (
    <DataTable
      data={rows}
      extraColumns={clientColumns}
      storageKey="clientes"
      initialVisibility={{
        telefono: false,
        correo: false,
        ultima_compra: false,
        ultimo_pago: false,
        proxima_actividad: false,
        estado_relacion: false,
      }}
      columnLabels={{
        header: "Cliente",
        type: "Contacto",
        status: "Ventas",
        target: "Total vendido",
        reviewer: "Vendedor",
      }}
      forcedColumnOrder={[
        "drag-handle",
        "row-select",
        "session",
        "empresa",
        "type",
        "telefono",
        "correo",
        "oportunidades",
        "chat",
        "visits",
        "cobrado",
        "saldo",
        "ultima_compra",
        "ultimo_pago",
        "proxima_actividad",
        "estado_relacion",
        "reviewer",
        "actions",
      ]}
    />
  );
}
