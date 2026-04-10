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

type SupabaseConnectivityEvent = {
  captured_at?: string;
  event_type?: string;
  operation?: string;
  attempt?: number;
  next_attempt?: number;
  retries_configured?: number;
  error?: string;
};

type SupabaseConnectivityResponse = {
  ok?: boolean;
  captured_at?: string;
  window_seconds?: number;
  loaded_events?: number;
  events_in_window?: number;
  summary?: {
    transient_retries?: number;
    transient_failures?: number;
    transient_recovered?: number;
    unknown?: number;
    unique_operations?: number;
  };
  counts_by_operation?: Record<string, number>;
  recent_events?: SupabaseConnectivityEvent[];
  error?: string;
};

const REFRESH_MS = 20_000;

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

function eventTypeLabel(value: string | undefined): string {
  if (value === "transient_retry_scheduled") return "Reintento programado";
  if (value === "transient_recovered") return "Recuperado";
  if (value === "transient_failure") return "Falla final";
  return value || "—";
}

export function SupabaseConnectivityClient() {
  const [windowSeconds, setWindowSeconds] = React.useState(3600);
  const [limit, setLimit] = React.useState(200);
  const [payload, setPayload] = React.useState<SupabaseConnectivityResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/ops/supabase-connectivity?window_seconds=${encodeURIComponent(String(windowSeconds))}&limit=${encodeURIComponent(String(limit))}`,
        { cache: "no-store" },
      );
      const body = (await response.json().catch(() => ({}))) as SupabaseConnectivityResponse;
      if (!response.ok) {
        setError(body?.error || "No se pudieron consultar métricas de conectividad.");
        return;
      }
      setPayload(body);
      setError(null);
    } catch (fetchError) {
      console.error("[ops] supabase-connectivity fetch failed", fetchError);
      setError("Error de red consultando métricas.");
    } finally {
      setLoading(false);
    }
  }, [limit, windowSeconds]);

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

  const summary = payload?.summary;
  const events = payload?.recent_events ?? [];
  const operationCounts = payload?.counts_by_operation ?? {};

  return (
    <div className="flex flex-col gap-6 px-4 py-2 lg:px-6">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Owner-only</p>
        <h1 className="text-3xl font-semibold tracking-tight">Supabase Connectivity</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Monitorea cortes transientes de red/DNS hacia Supabase y verifica si se recuperan con reintentos.
        </p>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Control</CardTitle>
          <Button type="button" variant="outline" onClick={() => void refresh()} disabled={loading}>
            {loading ? "Actualizando..." : "Actualizar"}
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="window-seconds">Ventana (segundos)</Label>
            <Input
              id="window-seconds"
              type="number"
              min={60}
              max={86400}
              value={windowSeconds}
              onChange={(event) => {
                const numeric = Number(event.target.value);
                if (Number.isNaN(numeric)) return;
                setWindowSeconds(Math.min(86400, Math.max(60, Math.trunc(numeric))));
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="history-limit">Eventos leídos</Label>
            <Input
              id="history-limit"
              type="number"
              min={1}
              max={500}
              value={limit}
              onChange={(event) => {
                const numeric = Number(event.target.value);
                if (Number.isNaN(numeric)) return;
                setLimit(Math.min(500, Math.max(1, Math.trunc(numeric))));
              }}
            />
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Snapshot: {formatDate(payload?.captured_at)}</p>
            <p>Eventos cargados: {payload?.loaded_events ?? 0}</p>
            <p>Eventos en ventana: {payload?.events_in_window ?? 0}</p>
          </div>
          {error ? <p className="text-sm text-destructive md:col-span-3">{error}</p> : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Reintentos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{summary?.transient_retries ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Fallas finales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{summary?.transient_failures ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Recuperadas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{summary?.transient_recovered ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Operaciones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{summary?.unique_operations ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">No clasificados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{summary?.unknown ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Operaciones con más incidencias</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {Object.keys(operationCounts).length ? (
            Object.entries(operationCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 12)
              .map(([operation, total]) => (
                <div key={operation} className="flex items-center justify-between">
                  <span className="truncate pr-3">{operation}</span>
                  <Badge variant="outline">{total}</Badge>
                </div>
              ))
          ) : (
            <p className="text-muted-foreground">Sin incidencias en la ventana.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Eventos recientes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[460px] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Operación</TableHead>
                  <TableHead>Intento</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.length ? (
                  events.map((event, index) => (
                    <TableRow key={`${event.captured_at || "no-date"}-${index}`}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatDate(event.captured_at)}
                      </TableCell>
                      <TableCell className="text-xs">{eventTypeLabel(event.event_type)}</TableCell>
                      <TableCell className="max-w-[260px] truncate text-xs">{event.operation || "—"}</TableCell>
                      <TableCell className="text-xs">
                        {typeof event.attempt === "number" ? event.attempt : "—"}
                        {typeof event.next_attempt === "number" ? ` -> ${event.next_attempt}` : ""}
                      </TableCell>
                      <TableCell className="max-w-[440px] truncate text-xs">
                        {event.error || "—"}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                      Sin eventos para la ventana seleccionada.
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
