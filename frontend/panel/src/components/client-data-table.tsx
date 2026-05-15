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
  toolbarActions?: React.ReactNode;
  renderRowDetails?: (row: DataTableRow) => React.ReactNode;
  detailDescription?: string;
  hideDefaultActions?: boolean;
};

export function ClientDataTable({
  rows,
  columnLabels,
  extraColumns,
  initialVisibility,
  storageKey,
  toolbarActions,
  renderRowDetails,
  detailDescription,
  hideDefaultActions,
}: Props) {
  return (
    <DataTable
      data={rows}
      columnLabels={columnLabels}
      extraColumns={extraColumns}
      initialVisibility={initialVisibility}
      storageKey={storageKey}
      toolbarActions={toolbarActions}
      renderRowDetails={renderRowDetails}
      detailDescription={detailDescription}
      hideDefaultActions={hideDefaultActions}
    />
  );
}
