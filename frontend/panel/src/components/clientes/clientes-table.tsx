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

const clientColumns: ColumnDef<DataTableRow>[] = [
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
        "oportunidades",
        "chat",
        "visits",
        "cobrado",
        "saldo",
        "reviewer",
        "actions",
      ]}
    />
  );
}
