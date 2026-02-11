"use client";

import { DataTable } from "@/components/data-table";
import type { DataTableColumnLabels, DataTableRow } from "@/components/data-table";

type Props = {
  rows: DataTableRow[];
  columnLabels?: DataTableColumnLabels;
};

export function ClientDataTable({ rows, columnLabels }: Props) {
  return <DataTable data={rows} columnLabels={columnLabels} />;
}
