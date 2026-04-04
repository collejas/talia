"use client";

import * as React from "react";

import type { CatalogPipelineRow, CatalogSalesRow } from "@/app/dashboard/catalog-analytics";
import { CatalogPipelineCard } from "@/components/dashboard/catalog-pipeline-card";
import { CatalogSalesCard } from "@/components/dashboard/catalog-sales-card";
import { Skeleton } from "@/components/ui/skeleton";

type CatalogLazySectionProps = {
  months?: number;
};

function addMonths(date: Date, months: number): Date {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

function formatMonth(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

export function CatalogLazySection({ months = 6 }: CatalogLazySectionProps) {
  const [salesRows, setSalesRows] = React.useState<CatalogSalesRow[] | null>(null);
  const [pipelineRows, setPipelineRows] = React.useState<CatalogPipelineRow[] | null>(null);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      const now = new Date();
      const desde = formatMonth(addMonths(now, -months + 1));
      const hasta = formatMonth(now);

      fetch(`/api/analytics/catalog/ventas?mes_desde=${encodeURIComponent(desde)}&mes_hasta=${encodeURIComponent(hasta)}`, {
        cache: "no-store",
      })
        .then(async (response) => (response.ok ? response.json() : { rows: [] }))
        .then((json) => setSalesRows(Array.isArray(json?.rows) ? json.rows : []))
        .catch(() => setSalesRows([]));

      fetch("/api/analytics/catalog/embudo", {
        cache: "no-store",
      })
        .then(async (response) => (response.ok ? response.json() : { rows: [] }))
        .then((json) => setPipelineRows(Array.isArray(json?.rows) ? json.rows : []))
        .catch(() => setPipelineRows([]));
    }, 700);

    return () => window.clearTimeout(timer);
  }, [months]);

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
      <CatalogSalesCard data={salesRows} />
      <CatalogPipelineCard data={pipelineRows} />
    </div>
  );
}
