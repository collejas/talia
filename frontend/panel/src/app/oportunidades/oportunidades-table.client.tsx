"use client";

import { ClientDataTable } from "@/components/client-data-table";
import type { DataTableColumnLabels, DataTableRow } from "@/components/data-table";

type Props = {
  rows: DataTableRow[];
  columnLabels?: DataTableColumnLabels;
};

export function OportunidadesTableClient({ rows, columnLabels }: Props) {
  return <ClientDataTable rows={rows} columnLabels={columnLabels} />;
}
