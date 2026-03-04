"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type OpsSnapshotResponse = {
  ok?: boolean;
  snapshot?: {
    captured_at?: string;
    window_seconds?: number;
    kpis?: {
      inbound_count?: number;
      inbound_per_minute?: number;
      assistant_reply_latency_p95_ms?: number;
      inbox_threads_latency_p95_ms?: number;
      twilio_error_rate?: number;
      twilio_error_counts?: Record<string, number>;
      queue_depth?: number;
    };
    mode?: {
      active?: boolean;
      reasons?: string[];
      last_changed_at?: string | null;
    };
  };
  mode?: {
    active?: boolean;
    reasons?: string[];
    last_changed_at?: string | null;
    recommended_inbox_poll_seconds?: number;
  };
  error?: string;
};

const REFRESH_MS = 20_000;

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("es-MX", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatPercent(value: number | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "0.00%";
  return `${(value * 100).toFixed(2)}%`;
}

export function OpsHighDemandClient() {
  const [payload, setPayload] = React.useState<OpsSnapshotResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/ops/high-demand-mode?window_seconds=300", {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => ({}))) as OpsSnapshotResponse;
      if (!response.ok) {
        setError(body?.error || "No se pudo consultar el estado de alta demanda.");
        return;
      }
      setPayload(body);
      setError(null);
    } catch (fetchError) {
      console.error("[ops] high-demand fetch failed", fetchError);
      setError("Error de red consultando alta demanda.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    const interval = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const mode = payload?.mode;
  const kpis = payload?.snapshot?.kpis;
  const errorCounts = kpis?.twilio_error_counts ?? {};

  return (
    <div className="flex flex-col gap-6 px-4 py-2 lg:px-6">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Owner-only</p>
        <h1 className="text-3xl font-semibold tracking-tight">Ops Alta Demanda</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Estado operativo del modo de autoprotección, KPIs de carga y recomendación de polling para Inbox.
        </p>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Estado</CardTitle>
          <Button type="button" variant="outline" onClick={() => void refresh()} disabled={loading}>
            {loading ? "Actualizando..." : "Actualizar"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {error ? <p className="text-destructive">{error}</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={mode?.active ? "destructive" : "secondary"}>
              {mode?.active ? "ALTA DEMANDA ACTIVA" : "Modo normal"}
            </Badge>
            <Badge variant="outline">Polling Inbox recomendado: {mode?.recommended_inbox_poll_seconds ?? "—"}s</Badge>
          </div>
          <p className="text-muted-foreground">Último cambio: {formatDate(mode?.last_changed_at)}</p>
          <p className="text-muted-foreground">
            Razones: {(mode?.reasons ?? []).length ? (mode?.reasons ?? []).join(", ") : "sin razones activas"}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Inbound (5 min)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{kpis?.inbound_count ?? 0}</div>
            <p className="text-xs text-muted-foreground">{kpis?.inbound_per_minute ?? 0} por minuto</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">AI p95 (ms)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{kpis?.assistant_reply_latency_p95_ms ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Inbox p95 (ms)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{kpis?.inbox_threads_latency_p95_ms ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Twilio error rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatPercent(kpis?.twilio_error_rate)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Queue depth</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{kpis?.queue_depth ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Twilio errores por código</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {Object.keys(errorCounts).length ? (
              Object.entries(errorCounts).map(([code, total]) => (
                <div key={code} className="flex items-center justify-between">
                  <span>{code}</span>
                  <Badge variant="outline">{total}</Badge>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">Sin errores en la ventana.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
