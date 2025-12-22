"use client";

import { DataTable, type DataTableColumnLabels, type DataTableRow } from "@/components/data-table";

import { LeadRestartDetails } from "./restart-details";

type Props = {
  data: DataTableRow[];
};

const columnLabels: DataTableColumnLabels = {
  header: "Contacto",
  type: "Etapa actual",
  status: "Reinicio",
  target: "Monto total",
  reviewer: "Vendedor",
};

export function LeadsRestartTableClient({ data }: Props) {
  return (
    <DataTable
      data={data}
      storageKey="leads-restarts-table-column-order"
      columnLabels={columnLabels}
      renderRowDetails={(row) => <LeadRestartDetails row={row} />}
    />
  );
}
