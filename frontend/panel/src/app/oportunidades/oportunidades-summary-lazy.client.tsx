"use client";

import * as React from "react";
import { IconChevronDown } from "@tabler/icons-react";

import { ChartAreaInteractive } from "@/components/chart-area-interactive";
import { RestartKpiCards } from "@/components/leads/restart-kpi-cards";
import { SectionCards } from "@/components/section-cards";
import { Skeleton } from "@/components/ui/skeleton";
import type { LeadsPayload } from "@/lib/leads/data";

type OportunidadesSummaryLazyProps = {
  days?: number;
  desde?: string;
  hasta?: string;
};

function SummaryFallback() {
  return (
    <div className="space-y-4 rounded-b-xl border border-t-0 bg-transparent pb-4 pt-4">
      <div className="grid grid-cols-1 gap-4 px-4 lg:grid-cols-2 lg:px-6 @5xl/main:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-40 rounded-xl" />
        ))}
      </div>
      <div className="px-4 lg:px-6">
        <Skeleton className="h-[260px] rounded-xl" />
      </div>
      <div className="px-4 lg:px-6">
        <Skeleton className="h-[120px] rounded-xl" />
      </div>
    </div>
  );
}

export function OportunidadesSummaryLazy({
  days = 30,
  desde,
  hasta,
}: OportunidadesSummaryLazyProps) {
  const [open, setOpen] = React.useState(false);
  const [payload, setPayload] = React.useState<LeadsPayload | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const requestedRef = React.useRef(false);

  React.useEffect(() => {
    if (!open) {
      setLoading(false);
      return;
    }
    if (payload || requestedRef.current) return;

    requestedRef.current = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      params.set("days", String(days));
      if (desde) params.set("desde", desde);
      if (hasta) params.set("hasta", hasta);

      setLoading(true);
      fetch(`/api/oportunidades/overview?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            const body = (await response.json().catch(() => ({}))) as { error?: string };
            throw new Error(body.error || `overview_${response.status}`);
          }
          return response.json();
        })
        .then((json) => setPayload(json as LeadsPayload))
        .catch((fetchError) => {
          if ((fetchError as Error).name !== "AbortError") {
            setError(
              fetchError instanceof Error
                ? fetchError.message
                : "No se pudo cargar el resumen de oportunidades.",
            );
          }
        })
        .finally(() => setLoading(false));
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [days, desde, hasta, open, payload]);

  React.useEffect(() => {
    if (!open) {
      requestedRef.current = false;
    }
  }, [open]);

  return (
    <details
      className="group px-4 lg:px-6"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="list-none">
        <div className="flex cursor-pointer items-center justify-between rounded-xl border bg-muted/50 px-3 py-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Resumen
            </span>
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              KPIs y gráfica de oportunidades
            </span>
          </div>
          <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Mostrar/Ocultar
            <IconChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
          </span>
        </div>
      </summary>
      {open ? (
        <div className="mt-0 space-y-4 rounded-b-xl border border-t-0 bg-transparent pb-4 pt-4">
          {error ? (
            <div className="px-4 lg:px-6">
              <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                {error}
              </div>
            </div>
          ) : null}
          {loading || !payload ? (
            <SummaryFallback />
          ) : (
            <>
              {payload.errors.length > 0 ? (
                <div className="px-4 lg:px-6">
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    {payload.errors.map((message) => (
                      <p key={message}>{message}</p>
                    ))}
                  </div>
                </div>
              ) : null}
              <SectionCards data={payload.cards} />
              <div className="px-4 lg:px-6">
                <ChartAreaInteractive data={payload.chart} />
              </div>
              <div className="px-4 lg:px-6">
                <RestartKpiCards kpis={payload.restartKpis} />
              </div>
            </>
          )}
        </div>
      ) : null}
    </details>
  );
}
