"use client";

import { DataTable } from "@/components/data-table";
import type {
  DataTableColumnLabels,
  DataTableRow,
} from "@/components/data-table";
import type { ColumnDef } from "@tanstack/react-table";

type Props = {
  rows: DataTableRow[];
  columnLabels?: DataTableColumnLabels;
  extraColumns?: ColumnDef<DataTableRow>[];
};

export function ClientDataTable({ rows, columnLabels, extraColumns }: Props) {
  return (
    <DataTable
      data={rows}
      columnLabels={columnLabels}
      extraColumns={extraColumns}
    />
  );
}
