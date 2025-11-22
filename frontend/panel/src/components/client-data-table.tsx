"use client";

import { DataTable } from "@/components/data-table";
import type { DataTableRow } from "@/components/data-table";

type Props = {
  rows: DataTableRow[];
};

export function ClientDataTable({ rows }: Props) {
  return <DataTable data={rows} />;
}
