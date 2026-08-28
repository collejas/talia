"use client";

import { DataTable } from "@/components/data-table";
import type {
  DataTableColumnLabels,
  DataTableRow,
  DateColumnConfig,
} from "@/components/data-table";
import type { ColumnDef } from "@tanstack/react-table";

type Props = {
  rows: DataTableRow[];
  columnLabels?: DataTableColumnLabels;
  extraColumns?: ColumnDef<DataTableRow>[];
  dateColumns?: DateColumnConfig[];
  initialVisibility?: Record<string, boolean>;
  storageKey?: string;
  toolbarActions?: React.ReactNode;
  renderRowDetails?: (row: DataTableRow) => React.ReactNode;
  detailDescription?: string;
  hideDefaultActions?: boolean;
  forcedColumnOrder?: string[];
  hiddenColumnIds?: string[];
};

export function ClientDataTable({
  rows,
  columnLabels,
  extraColumns,
  dateColumns,
  initialVisibility,
  storageKey,
  toolbarActions,
  renderRowDetails,
  detailDescription,
  hideDefaultActions,
  forcedColumnOrder,
  hiddenColumnIds,
}: Props) {
  return (
    <DataTable
      data={rows}
      columnLabels={columnLabels}
      extraColumns={extraColumns}
      dateColumns={dateColumns}
      initialVisibility={initialVisibility}
      storageKey={storageKey}
      toolbarActions={toolbarActions}
      renderRowDetails={renderRowDetails}
      detailDescription={detailDescription}
      hideDefaultActions={hideDefaultActions}
      forcedColumnOrder={forcedColumnOrder}
      hiddenColumnIds={hiddenColumnIds}
    />
  );
}
