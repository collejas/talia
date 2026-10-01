"use client";

import * as React from "react";

import { AcquisitionSummary } from "@/components/mapa-conversion/acquisition-summary";
import { CampaignConversionSummary } from "@/components/mapa-conversion/campaign-conversion-summary.client";
import type { DemografiaSummaryResponse } from "@/lib/mapa-conversion/api";
import {
  buildDeferredCampaignAttribution,
  type DeferredCampaignAttribution,
} from "@/lib/mapa-conversion/acquisition";

type Props = {
  summary: DemografiaSummaryResponse | null;
  filters: {
    campanaId: string | null;
    campanaTipo: string | null;
    templateId: string | null;
    rango: string | null;
    desde: string | null;
    hasta: string | null;
  };
};

export function DeferredCampaignSummary({ summary, filters }: Props) {
  const [attribution, setAttribution] = React.useState<DeferredCampaignAttribution | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }

    fetch(`/api/crm/mapa-conversion/campaign-attribution?${params.toString()}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`campaign_attribution_${response.status}`);
        return (await response.json()) as DeferredCampaignAttribution;
      })
      .then(setAttribution)
      .catch((error: unknown) => {
        if (!controller.signal.aborted && !(error instanceof DOMException && error.name === "AbortError")) {
          console.error("mapa.campaign_attribution.failed", error);
        }
      });

    return () => controller.abort();
  }, [filters]);

  const enrichedSummary = React.useMemo(() => {
    if (!summary || !attribution) return summary;
    return {
      ...summary,
      attribution_rankings: buildDeferredCampaignAttribution(attribution, filters),
    };
  }, [summary, attribution, filters]);

  return (
    <div className="space-y-6">
      {attribution?.warnings?.length ? (
        <div
          className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200"
          role="status"
        >
          La atribución se cargó parcialmente; algunos bloques tardaron más de lo permitido.
        </div>
      ) : null}
      <CampaignConversionSummary
        filters={{
          campanaId: filters.campanaId,
          campanaTipo: filters.campanaTipo,
          rango: filters.rango,
          desde: filters.desde,
          hasta: filters.hasta,
        }}
      />
      <AcquisitionSummary summary={enrichedSummary} mode="campaigns" />
    </div>
  );
}
