"use client";

import * as React from "react";

import { AcquisitionSummary } from "@/components/mapa-conversion/acquisition-summary";
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
        if (!controller.signal.aborted) console.error("mapa.campaign_attribution.failed", error);
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

  return <AcquisitionSummary summary={enrichedSummary} mode="campaigns" />;
}
