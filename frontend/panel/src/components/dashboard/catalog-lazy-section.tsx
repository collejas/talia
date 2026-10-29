"use client";

import * as React from "react";

import type { CatalogPipelineRow, CatalogSalesRow } from "@/app/dashboard/catalog-analytics";
import { CatalogPipelineCard } from "@/components/dashboard/catalog-pipeline-card";
import { CatalogSalesCard } from "@/components/dashboard/catalog-sales-card";
import { Skeleton } from "@/components/ui/skeleton";

type CatalogLazySectionProps = {
  dateFrom: string | null;
  dateTo: string | null;
};

export function CatalogLazySection({ dateFrom, dateTo }: CatalogLazySectionProps) {
  const [salesRows, setSalesRows] = React.useState<CatalogSalesRow[] | null>(null);
  const [pipelineRows, setPipelineRows] = React.useState<CatalogPipelineRow[] | null>(null);

  React.useEffect(() => {
    setSalesRows(null);
    setPipelineRows(null);
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (dateFrom) params.set("fecha_desde", dateFrom);
      if (dateTo) params.set("fecha_hasta", dateTo);
      const query = params.toString();

      fetch(`/api/analytics/catalog/ventas${query ? `?${query}` : ""}`, {
        cache: "no-store",
      })
        .then(async (response) => (response.ok ? response.json() : { rows: [] }))
        .then((json) => setSalesRows(Array.isArray(json?.rows) ? json.rows : []))
        .catch(() => setSalesRows([]));

      fetch(`/api/analytics/catalog/embudo${query ? `?${query}` : ""}`, {
        cache: "no-store",
      })
        .then(async (response) => (response.ok ? response.json() : { rows: [] }))
        .then((json) => setPipelineRows(Array.isArray(json?.rows) ? json.rows : []))
        .catch(() => setPipelineRows([]));
    }, 700);

    return () => window.clearTimeout(timer);
  }, [dateFrom, dateTo]);

  if (!salesRows || !pipelineRows) {
    return (
      <div className="grid gap-4 px-4 lg:px-6 @[1000px]/main:grid-cols-2">
        <Skeleton className="h-[320px] rounded-xl" />
        <Skeleton className="h-[320px] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 px-4 lg:px-6 @[1000px]/main:grid-cols-2">
      <CatalogSalesCard data={salesRows} dateFrom={dateFrom} dateTo={dateTo} />
      <CatalogPipelineCard data={pipelineRows} />
    </div>
  );
}
