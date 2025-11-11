"use client";

import type { VisibilityState } from "@tanstack/react-table";

import {
  DataTable,
  type DataTableColumnLabels,
  type DataTableRow,
} from "@/components/data-table";
import type { DemografiaSummaryResponse } from "@/lib/mapa-conversion/api";

import { MapaConversionRowDetail } from "./row-detail";

type MetricColumn = {
  id: string;
  label: string;
  metricKey: string;
};

type Props = {
  data: DataTableRow[];
  storageKey?: string;
  columnLabels?: DataTableColumnLabels;
  metricColumns?: MetricColumn[];
  initialVisibility?: VisibilityState;
  nivel: "pais" | "estado" | "municipio";
  summary: DemografiaSummaryResponse | null;
};

export function MapaConversionTableClient({
  data,
  storageKey,
  columnLabels,
  metricColumns,
  initialVisibility,
  nivel,
  summary,
}: Props) {
  return (
    <DataTable
      data={data}
      storageKey={storageKey}
      columnLabels={columnLabels}
      metricColumns={metricColumns}
      initialVisibility={initialVisibility}
      renderRowDetails={(row) => (
        <MapaConversionRowDetail row={row} nivel={nivel} summary={summary} />
      )}
    />
  );
}
