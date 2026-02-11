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
  initialVisibility?: Record<string, boolean>;
  storageKey?: string;
};

export function ClientDataTable({
  rows,
  columnLabels,
  extraColumns,
  initialVisibility,
  storageKey,
}: Props) {
  return (
    <DataTable
      data={rows}
      columnLabels={columnLabels}
      extraColumns={extraColumns}
      initialVisibility={initialVisibility}
      storageKey={storageKey}
    />
  );
}
