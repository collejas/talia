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
    id: "dominio_comercial",
    accessorFn: (row) => textValue(row, "dominio_comercial"),
    header: ({ column }) => <SortButton column={column} label="Dominio" />,
    cell: ({ row }) => {
      const value = textValue(row.original, "dominio_comercial");
      return value === "propiedades" ? "Propiedades" : value === "mixto" ? "Mixto" : value === "productos_servicios" ? "Productos/servicios" : "—";
    },
    meta: { label: "Dominio" },
  },
  {
    id: "numero_propiedades",
    accessorFn: (row) => Number(rawValue(row, "numero_propiedades")) || 0,
    header: ({ column }) => <SortButton column={column} label="Propiedades" />,
    cell: ({ row }) => <span className="tabular-nums">{textValue(row.original, "numero_propiedades")}</span>,
    meta: { label: "Propiedades" },
  },
  {
    id: "ultima_propiedad",
    accessorFn: (row) => `${textValue(row, "ultimo_desarrollo_nombre")} ${textValue(row, "ultima_unidad_nombre")}`,
    header: ({ column }) => <SortButton column={column} label="Última propiedad" />,
    cell: ({ row }) => {
      const development = textValue(row.original, "ultimo_desarrollo_nombre");
      const unit = textValue(row.original, "ultima_unidad_nombre");
      return development === "—" && unit === "—" ? "—" : [development, unit].filter((value) => value !== "—").join(" · ");
    },
    meta: { label: "Última propiedad" },
  },
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

export function ClientesTable({ rows, showPropertyColumns = true }: { rows: DataTableRow[]; showPropertyColumns?: boolean }) {
  const visibleColumns = showPropertyColumns
    ? clientColumns
    : clientColumns.filter((column) => !["dominio_comercial", "numero_propiedades", "ultima_propiedad"].includes(String(column.id)));
  return (
    <DataTable
      data={rows}
      extraColumns={visibleColumns}
      storageKey="clientes"
      initialVisibility={{
        dominio_comercial: true,
        numero_propiedades: true,
        ultima_propiedad: true,
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
