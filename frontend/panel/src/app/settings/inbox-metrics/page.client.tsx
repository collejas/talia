"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type CurrentMetricsResponse = {
  ok?: boolean;
  window_seconds?: number;
  sample_count?: number;
  latency_ms?: {
    p50?: number;
    p90?: number;
    p95?: number;
    avg?: number;
    max?: number;
  };
  cache?: {
    hits?: number;
    misses?: number;
    hit_rate?: number;
  };
  slow_queries_over_3000ms?: number;
  process_metrics?: {
    window_seconds?: number;
    sample_count?: number;
    endpoints?: Record<
      string,
      {
        request_count?: number;
        latency_ms?: {
          p50?: number;
          p90?: number;
          p95?: number;
          avg?: number;
          max?: number;
        };
        slow_queries_over_3000ms?: number;
        flags?: Record<string, number>;
      }
    >;
  };
  error?: string;
};

type SnapshotItem = {
  captured_at?: string;
  actor_user_id?: string | null;
  window_seconds?: number;
  snapshot?: CurrentMetricsResponse;
};

type SnapshotsResponse = {
  ok?: boolean;
  items?: SnapshotItem[];
  error?: string;
};

const REFRESH_MS = 30_000;

function formatDate(value: string | undefined): string {
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

function formatRate(value: number | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "0.00%";
  return `${(value * 100).toFixed(2)}%`;
}

function formatMetric(value: number | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return value.toFixed(2);
}

function metricTone(value: number | undefined, warnAt: number, dangerAt: number): "secondary" | "outline" | "destructive" {
  if (typeof value !== "number") return "secondary";
  if (value >= dangerAt) return "destructive";
  if (value >= warnAt) return "outline";
  return "secondary";
}

type ChartPoint = {
  label: string;
  p95: number;
  hitRatePct: number;
};

type ProcessChartPoint = {
  label: string;
  p95: number;
};

function buildChartPoints(items: SnapshotItem[]): ChartPoint[] {
  const ordered = [...items]
    .filter((item) => item?.captured_at && item?.snapshot?.latency_ms?.p95 != null)
    .sort((a, b) => {
      const aTs = new Date(a.captured_at as string).getTime();
      const bTs = new Date(b.captured_at as string).getTime();
      return aTs - bTs;
    })
    .slice(-24);

  return ordered.map((item) => {
    const p95Raw = item.snapshot?.latency_ms?.p95;
    const hitRateRaw = item.snapshot?.cache?.hit_rate;
    const dt = new Date(item.captured_at as string);
    const label = Number.isNaN(dt.getTime())
      ? "—"
      : dt.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
    return {
      label,
      p95: typeof p95Raw === "number" ? p95Raw : 0,
      hitRatePct: typeof hitRateRaw === "number" ? hitRateRaw * 100 : 0,
    };
  });
}

function buildProcessChartPoints(items: SnapshotItem[], endpoint: string): ProcessChartPoint[] {
  const ordered = [...items]
    .filter((item) => item?.captured_at)
    .sort((a, b) => {
      const aTs = new Date(a.captured_at as string).getTime();
      const bTs = new Date(b.captured_at as string).getTime();
      return aTs - bTs;
    })
    .slice(-24);

  return ordered.map((item) => {
    const p95Raw = item.snapshot?.process_metrics?.endpoints?.[endpoint]?.latency_ms?.p95;
    const dt = new Date(item.captured_at as string);
    const label = Number.isNaN(dt.getTime())
      ? "—"
      : dt.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
    return {
      label,
      p95: typeof p95Raw === "number" ? p95Raw : 0,
    };
  });
}

function buildPolyline(points: number[], width: number, height: number): string {
  if (!points.length) return "";
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  return points
    .map((value, index) => {
      const x = (index / Math.max(1, points.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export function InboxMetricsOwnerClient() {
  const [windowSeconds, setWindowSeconds] = React.useState(300);
  const [current, setCurrent] = React.useState<CurrentMetricsResponse | null>(null);
  const [history, setHistory] = React.useState<SnapshotItem[]>([]);
  const [loadingCurrent, setLoadingCurrent] = React.useState(false);
  const [loadingHistory, setLoadingHistory] = React.useState(false);
  const [savingSnapshot, setSavingSnapshot] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const refreshCurrent = React.useCallback(async () => {
    setLoadingCurrent(true);
    try {
      const response = await fetch(
        `/api/inbox/threads/metrics?window_seconds=${encodeURIComponent(String(windowSeconds))}`,
        { cache: "no-store" },
      );
      const payload = (await response.json().catch(() => ({}))) as CurrentMetricsResponse;
      if (!response.ok) {
        setError(payload?.error || "No se pudo consultar la métrica actual.");
        return;
      }
      setCurrent(payload);
      setError(null);
    } catch (fetchError) {
      console.error("[inbox-metrics] refreshCurrent failed", fetchError);
      setError("Error de red consultando métricas actuales.");
    } finally {
      setLoadingCurrent(false);
    }
  }, [windowSeconds]);

  const refreshHistory = React.useCallback(async () => {
    setLoadingHistory(true);
    try {
      const response = await fetch("/api/inbox/threads/metrics/snapshots?limit=200", {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as SnapshotsResponse;
      if (!response.ok) {
        setError(payload?.error || "No se pudo consultar historial de snapshots.");
        return;
      }
      setHistory(Array.isArray(payload.items) ? payload.items : []);
      setError(null);
    } catch (fetchError) {
      console.error("[inbox-metrics] refreshHistory failed", fetchError);
      setError("Error de red consultando historial de snapshots.");
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const saveSnapshot = React.useCallback(async () => {
    setSavingSnapshot(true);
    try {
      const response = await fetch("/api/inbox/threads/metrics/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ window_seconds: windowSeconds }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        snapshot?: SnapshotItem;
      };
      if (!response.ok) {
        setError(payload?.error || "No se pudo guardar el snapshot.");
        return;
      }
      await Promise.all([refreshCurrent(), refreshHistory()]);
      setError(null);
    } catch (fetchError) {
      console.error("[inbox-metrics] saveSnapshot failed", fetchError);
      setError("Error de red guardando snapshot.");
    } finally {
      setSavingSnapshot(false);
    }
  }, [refreshCurrent, refreshHistory, windowSeconds]);

  React.useEffect(() => {
    void Promise.all([refreshCurrent(), refreshHistory()]);
  }, [refreshCurrent, refreshHistory]);

  React.useEffect(() => {
    const interval = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void refreshCurrent();
    }, REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [refreshCurrent]);

  const p95 = current?.latency_ms?.p95;
  const hitRate = current?.cache?.hit_rate;
  const slowQueries = current?.slow_queries_over_3000ms;
  const processEndpoints = current?.process_metrics?.endpoints ?? {};
  const prospectListMetrics = processEndpoints["prospeccion.prospectos.list"];
  const prospectQueriesMetrics = processEndpoints["prospeccion.prospectos.queries"];
  const demografiaResumenMetrics = processEndpoints["demografia.resumen_v2"];
  const demografiaMapaMetrics = processEndpoints["demografia.mapa_v2"];
  const chartPoints = React.useMemo(() => buildChartPoints(history), [history]);
  const p95Polyline = React.useMemo(
    () => buildPolyline(chartPoints.map((point) => point.p95), 100, 32),
    [chartPoints],
  );
  const hitRatePolyline = React.useMemo(
    () => buildPolyline(chartPoints.map((point) => point.hitRatePct), 100, 32),
    [chartPoints],
  );
  const prospectListChartPoints = React.useMemo(
    () => buildProcessChartPoints(history, "prospeccion.prospectos.list"),
    [history],
  );
  const prospectListP95Polyline = React.useMemo(
    () => buildPolyline(prospectListChartPoints.map((point) => point.p95), 100, 32),
    [prospectListChartPoints],
  );
  const prospectQueriesChartPoints = React.useMemo(
    () => buildProcessChartPoints(history, "prospeccion.prospectos.queries"),
    [history],
  );
  const prospectQueriesP95Polyline = React.useMemo(
    () => buildPolyline(prospectQueriesChartPoints.map((point) => point.p95), 100, 32),
    [prospectQueriesChartPoints],
  );
  const demografiaResumenChartPoints = React.useMemo(
    () => buildProcessChartPoints(history, "demografia.resumen_v2"),
    [history],
  );
  const demografiaResumenP95Polyline = React.useMemo(
    () => buildPolyline(demografiaResumenChartPoints.map((point) => point.p95), 100, 32),
    [demografiaResumenChartPoints],
  );
  const demografiaMapaChartPoints = React.useMemo(
    () => buildProcessChartPoints(history, "demografia.mapa_v2"),
    [history],
  );
  const demografiaMapaP95Polyline = React.useMemo(
    () => buildPolyline(demografiaMapaChartPoints.map((point) => point.p95), 100, 32),
    [demografiaMapaChartPoints],
  );

  return (
    <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Observabilidad / Owner-only
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Inbox Threads Metrics</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Vista privada para monitorear latencia y cache-hit de Inbox. Los snapshots se guardan en log para histórico.
        </p>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Control</CardTitle>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => void refreshCurrent()} disabled={loadingCurrent}>
              {loadingCurrent ? "Actualizando..." : "Actualizar"}
            </Button>
            <Button type="button" onClick={() => void saveSnapshot()} disabled={savingSnapshot}>
              {savingSnapshot ? "Guardando..." : "Guardar snapshot"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex w-full max-w-[220px] flex-col gap-2">
            <Label htmlFor="window-seconds">Ventana (segundos)</Label>
            <Input
              id="window-seconds"
              type="number"
              min={60}
              max={3600}
              value={windowSeconds}
              onChange={(event) => {
                const numeric = Number(event.target.value);
                if (Number.isNaN(numeric)) return;
                setWindowSeconds(Math.min(3600, Math.max(60, Math.trunc(numeric))));
              }}
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Polling automático cada {REFRESH_MS / 1000}s (solo con pestaña visible).
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Latency p95 (ms)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{typeof p95 === "number" ? p95.toFixed(2) : "—"}</div>
            <Badge variant={metricTone(p95, 2000, 3000)} className="mt-2">
              objetivo &lt; 2000
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Cache hit-rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatRate(hitRate)}</div>
            <Badge variant="secondary" className="mt-2">
              hits: {current?.cache?.hits ?? 0} / misses: {current?.cache?.misses ?? 0}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Queries &gt; 3000ms</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{typeof slowQueries === "number" ? slowQueries : "—"}</div>
            <Badge variant={metricTone(slowQueries, 1, 10)} className="mt-2">
              acumulado proceso
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Samples ventana</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{current?.sample_count ?? 0}</div>
            <Badge variant="secondary" className="mt-2">
              window: {current?.window_seconds ?? windowSeconds}s
            </Badge>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Métricas de Proceso</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-border/60 p-3">
            <p className="text-sm font-medium">/prospeccion/prospectos</p>
            <div className="mt-2 text-sm text-muted-foreground">
              req: {prospectListMetrics?.request_count ?? 0} · p95: {formatMetric(prospectListMetrics?.latency_ms?.p95)} ms
            </div>
            <div className="text-sm text-muted-foreground">
              slow &gt; 3s: {prospectListMetrics?.slow_queries_over_3000ms ?? 0}
            </div>
          </div>
          <div className="rounded-lg border border-border/60 p-3">
            <p className="text-sm font-medium">/prospeccion/prospectos/queries</p>
            <div className="mt-2 text-sm text-muted-foreground">
              req: {prospectQueriesMetrics?.request_count ?? 0} · p95: {formatMetric(prospectQueriesMetrics?.latency_ms?.p95)} ms
            </div>
            <div className="text-sm text-muted-foreground">
              slow &gt; 3s: {prospectQueriesMetrics?.slow_queries_over_3000ms ?? 0}
            </div>
          </div>
          <div className="rounded-lg border border-border/60 p-3">
            <p className="text-sm font-medium">/demografia/resumen-v2</p>
            <div className="mt-2 text-sm text-muted-foreground">
              req: {demografiaResumenMetrics?.request_count ?? 0} · p95: {formatMetric(demografiaResumenMetrics?.latency_ms?.p95)} ms
            </div>
            <div className="text-sm text-muted-foreground">
              cache hit: {Math.trunc(Number(demografiaResumenMetrics?.flags?.cache_hit ?? 0))}
              {" · "}
              miss: {Math.trunc(Number(demografiaResumenMetrics?.flags?.cache_miss ?? 0))}
            </div>
          </div>
          <div className="rounded-lg border border-border/60 p-3">
            <p className="text-sm font-medium">/demografia/mapa-v2</p>
            <div className="mt-2 text-sm text-muted-foreground">
              req: {demografiaMapaMetrics?.request_count ?? 0} · p95: {formatMetric(demografiaMapaMetrics?.latency_ms?.p95)} ms
            </div>
            <div className="text-sm text-muted-foreground">
              cache hit: {Math.trunc(Number(demografiaMapaMetrics?.flags?.cache_hit ?? 0))}
              {" · "}
              miss: {Math.trunc(Number(demografiaMapaMetrics?.flags?.cache_miss ?? 0))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Mini gráfica (últimos 24 snapshots)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <div className="rounded-lg border border-border/60 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">p95 (ms)</p>
            {p95Polyline ? (
              <svg viewBox="0 0 100 32" className="h-24 w-full">
                <polyline
                  points={p95Polyline}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="text-emerald-600"
                />
              </svg>
            ) : (
              <p className="text-sm text-muted-foreground">Aún no hay suficientes snapshots.</p>
            )}
          </div>
          <div className="rounded-lg border border-border/60 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Hit-rate (%)</p>
            {hitRatePolyline ? (
              <svg viewBox="0 0 100 32" className="h-24 w-full">
                <polyline
                  points={hitRatePolyline}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="text-sky-600"
                />
              </svg>
            ) : (
              <p className="text-sm text-muted-foreground">Aún no hay suficientes snapshots.</p>
            )}
          </div>
          <div className="rounded-lg border border-border/60 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Prospectos list p95 (ms)</p>
            {prospectListP95Polyline ? (
              <svg viewBox="0 0 100 32" className="h-24 w-full">
                <polyline
                  points={prospectListP95Polyline}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="text-amber-600"
                />
              </svg>
            ) : (
              <p className="text-sm text-muted-foreground">Aún no hay suficientes snapshots.</p>
            )}
          </div>
          <div className="rounded-lg border border-border/60 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Prospectos queries p95 (ms)</p>
            {prospectQueriesP95Polyline ? (
              <svg viewBox="0 0 100 32" className="h-24 w-full">
                <polyline
                  points={prospectQueriesP95Polyline}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="text-violet-600"
                />
              </svg>
            ) : (
              <p className="text-sm text-muted-foreground">Aún no hay suficientes snapshots.</p>
            )}
          </div>
          <div className="rounded-lg border border-border/60 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Demografía resumen p95 (ms)</p>
            {demografiaResumenP95Polyline ? (
              <svg viewBox="0 0 100 32" className="h-24 w-full">
                <polyline
                  points={demografiaResumenP95Polyline}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="text-rose-600"
                />
              </svg>
            ) : (
              <p className="text-sm text-muted-foreground">Aún no hay suficientes snapshots.</p>
            )}
          </div>
          <div className="rounded-lg border border-border/60 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Demografía mapa p95 (ms)</p>
            {demografiaMapaP95Polyline ? (
              <svg viewBox="0 0 100 32" className="h-24 w-full">
                <polyline
                  points={demografiaMapaP95Polyline}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="text-cyan-600"
                />
              </svg>
            ) : (
              <p className="text-sm text-muted-foreground">Aún no hay suficientes snapshots.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Histórico de snapshots</CardTitle>
          <Button type="button" variant="outline" onClick={() => void refreshHistory()} disabled={loadingHistory}>
            {loadingHistory ? "Cargando..." : "Recargar historial"}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Window</TableHead>
                  <TableHead>p95</TableHead>
                  <TableHead>Hit-rate</TableHead>
                  <TableHead>Slow &gt;3s</TableHead>
                  <TableHead>Prospectos p95</TableHead>
                  <TableHead>Queries p95</TableHead>
                  <TableHead>Resumen v2 p95</TableHead>
                  <TableHead>Mapa v2 p95</TableHead>
                  <TableHead>Samples</TableHead>
                  <TableHead>Actor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.length ? (
                  history.map((item, index) => {
                    const snapshot = item.snapshot ?? {};
                    return (
                      <TableRow key={`${item.captured_at ?? "row"}-${index}`}>
                        <TableCell>{formatDate(item.captured_at)}</TableCell>
                        <TableCell>{item.window_seconds ?? "—"}</TableCell>
                        <TableCell>{snapshot.latency_ms?.p95 ?? "—"}</TableCell>
                        <TableCell>{formatRate(snapshot.cache?.hit_rate)}</TableCell>
                        <TableCell>{snapshot.slow_queries_over_3000ms ?? "—"}</TableCell>
                        <TableCell>
                          {snapshot.process_metrics?.endpoints?.["prospeccion.prospectos.list"]?.latency_ms?.p95 ?? "—"}
                        </TableCell>
                        <TableCell>
                          {snapshot.process_metrics?.endpoints?.["prospeccion.prospectos.queries"]?.latency_ms?.p95 ?? "—"}
                        </TableCell>
                        <TableCell>
                          {snapshot.process_metrics?.endpoints?.["demografia.resumen_v2"]?.latency_ms?.p95 ?? "—"}
                        </TableCell>
                        <TableCell>
                          {snapshot.process_metrics?.endpoints?.["demografia.mapa_v2"]?.latency_ms?.p95 ?? "—"}
                        </TableCell>
                        <TableCell>{snapshot.sample_count ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {item.actor_user_id ?? "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-sm text-muted-foreground">
                      No hay snapshots guardados todavía.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
