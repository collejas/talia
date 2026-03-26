"use client";

import { DataTable, type DataTableColumnLabels, type DataTableRow } from "@/components/data-table";
import type { SalesRepOption } from "@/lib/leads/sales-reps";

import { LeadRestartDetails } from "./restart-details";

type Props = {
  data: DataTableRow[];
  salesReps: SalesRepOption[];
};

const columnLabels: DataTableColumnLabels = {
  header: "Contacto",
  type: "Etapa actual",
  status: "Reinicio",
  target: "Monto total",
  reviewer: "Vendedor",
};

export function LeadsRestartTableClient({ data, salesReps }: Props) {
  return (
    <DataTable
      data={data}
      storageKey="leads-restarts-table-column-order"
      columnLabels={columnLabels}
      renderRowDetails={(row) => <LeadRestartDetails row={row} salesReps={salesReps} />}
    />
  );
}
