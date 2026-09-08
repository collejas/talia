"use client";

import { useEffect, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SalesAssignmentResponseTimeMetrics, SalesAssignmentResponseTimeVendor } from "@/lib/crm/asignaciones-vendedores";

type Props = { data: SalesAssignmentResponseTimeMetrics | null; error: string | null };

export function SalesAssignmentResponseTimeView({ data, error }: Props) {
  const [selectedPeriod, setSelectedPeriod] = useState("mes");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [metrics, setMetrics] = useState(data);
  const [requestError, setRequestError] = useState<string | null>(error);

  useEffect(() => {
    if (selectedPeriod === "personalizado" && (!customFrom || !customTo)) return;
    const params = new URLSearchParams({ periodo: selectedPeriod });
    if (selectedPeriod === "personalizado") {
      params.set("desde", customFrom);
      params.set("hasta", customTo);
    }
    let active = true;
    fetch(`/api/embudo/asignaciones/tiempos?${params.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "No fue posible cargar las métricas");
        return body as SalesAssignmentResponseTimeMetrics;
      })
      .then((nextMetrics) => {
        if (active) {
          setMetrics(nextMetrics);
          setRequestError(null);
        }
      })
      .catch((requestFailure: unknown) => {
        if (active) setRequestError(requestFailure instanceof Error ? requestFailure.message : "No fue posible cargar las métricas");
      });
    return () => { active = false; };
  }, [customFrom, customTo, data, selectedPeriod]);

  if (requestError) return <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{requestError}</div>;

  const activeData = metrics;
  if (!activeData || activeData.vendedores.length === 0) {
    return <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">Aún no hay notificaciones de oportunidades por WhatsApp para medir.</div>;
  }

  const chartRows = activeData.vendedores.map((vendor) => ({
    vendedor: shortName(vendor.vendedor),
    rapido: vendor.porcentaje_rapido,
    medio: vendor.porcentaje_medio,
    lento: vendor.porcentaje_lento,
    promedio: vendor.promedio_segundos ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
        <div className="grid gap-1.5">
          <label htmlFor="sales-assignment-period" className="text-sm font-medium">Periodo</label>
          <select id="sales-assignment-period" value={selectedPeriod} onChange={(event) => setSelectedPeriod(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm">
            <option value="semana">Semana</option>
            <option value="quincena">Quincena</option>
            <option value="mes">Mes</option>
            <option value="bimestre">Bimestre</option>
            <option value="trimestre">Trimestre</option>
            <option value="semestre">Semestre</option>
            <option value="ano">Año</option>
            <option value="personalizado">Personalizado</option>
          </select>
        </div>
        {selectedPeriod === "personalizado" && <>
          <div className="grid gap-1.5"><label htmlFor="sales-assignment-from" className="text-sm font-medium">Desde</label><input id="sales-assignment-from" type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm" /></div>
          <div className="grid gap-1.5"><label htmlFor="sales-assignment-to" className="text-sm font-medium">Hasta</label><input id="sales-assignment-to" type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm" /></div>
        </>}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard title="Vendedor más rápido" value={activeData.vendedor_mas_rapido?.vendedor ?? "—"} detail={activeData.vendedor_mas_rapido ? `Promedio ${formatDuration(activeData.vendedor_mas_rapido.promedio_segundos)} · ${activeData.vendedor_mas_rapido.aceptadas} aceptadas` : "Sin aceptaciones"} />
        <MetricCard title="Vendedor más lento" value={activeData.vendedor_mas_lento?.vendedor ?? "—"} detail={activeData.vendedor_mas_lento ? `Promedio ${formatDuration(activeData.vendedor_mas_lento.promedio_segundos)} · ${activeData.vendedor_mas_lento.aceptadas} aceptadas` : "Sin aceptaciones"} />
        <MetricCard title="Leads pendientes" value={String(activeData.pendientes)} detail={formatPendingDetail(activeData.pendientes_por_vendedor)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tiempo de aceptación por vendedor</CardTitle>
          <CardDescription>Las columnas muestran porcentajes; la línea muestra el tiempo promedio real de aceptación. Total: {activeData.notificaciones} notificaciones · {activeData.aceptadas} aceptadas · {activeData.porcentaje_aceptacion.toFixed(1)}% de aceptación.</CardDescription>
        </CardHeader>
        <CardContent className="h-[420px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartRows} margin={{ top: 12, right: 20, left: 4, bottom: 56 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="vendedor" angle={-32} textAnchor="end" interval={0} height={72} tick={{ fontSize: 11 }} />
              <YAxis yAxisId="percent" domain={[0, 100]} tickFormatter={(value) => `${value}%`} width={46} />
              <YAxis yAxisId="seconds" orientation="right" tickFormatter={(value) => formatAxisDuration(value)} width={58} />
              <Tooltip formatter={(value, name) => {
                const isAverage = name === "promedio" || name === "Promedio";
                return [isAverage ? formatDuration(Number(value)) : `${Number(value).toFixed(1)}%`, isAverage ? "Promedio" : name === "rapido" ? "Rápido" : name === "medio" ? "Medio" : "Lento"];
              }} />
              <Legend />
              <Bar yAxisId="percent" dataKey="rapido" name="Rápido <60s" stackId="speed" fill="#22c55e" />
              <Bar yAxisId="percent" dataKey="medio" name="Medio 60–300s" stackId="speed" fill="#f59e0b" />
              <Bar yAxisId="percent" dataKey="lento" name="Lento >300s" stackId="speed" fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Line yAxisId="seconds" type="monotone" dataKey="promedio" name="Promedio" stroke="#2563eb" strokeWidth={3} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Detalle por vendedor</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[980px] text-sm">
            <thead><tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">{["Vendedor", "Aceptadas/Totales", "Pendientes", "Prom.", "Mín.", "Máx.", "% Acept.", "% Ráp.", "% Med.", "% Lentas"].map((label) => <th key={label} className="whitespace-nowrap px-4 py-3 font-medium">{label}</th>)}</tr></thead>
            <tbody>{activeData.vendedores.map((vendor) => <VendorRow key={vendor.vendedor_usuario_id} vendor={vendor} />)}</tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function VendorRow({ vendor }: { vendor: SalesAssignmentResponseTimeVendor }) {
  return <tr className="border-b last:border-0 hover:bg-muted/20"><td className="px-4 py-3 font-medium">{vendor.vendedor}</td><td className="px-4 py-3">{vendor.aceptadas}/{vendor.totales}</td><td className="px-4 py-3">{vendor.pendientes}</td><td className="px-4 py-3">{formatDuration(vendor.promedio_segundos)}</td><td className="px-4 py-3">{formatDuration(vendor.minimo_segundos)}</td><td className="px-4 py-3">{formatDuration(vendor.maximo_segundos)}</td><td className="px-4 py-3">{vendor.porcentaje_aceptacion.toFixed(1)}%</td><td className="px-4 py-3">{vendor.porcentaje_rapido.toFixed(1)}%</td><td className="px-4 py-3">{vendor.porcentaje_medio.toFixed(1)}%</td><td className="px-4 py-3">{vendor.porcentaje_lento.toFixed(1)}%</td></tr>;
}

function MetricCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return <Card><CardHeader className="pb-2"><CardDescription>{title}</CardDescription><CardTitle className="text-xl">{value}</CardTitle></CardHeader><CardContent><p className="text-xs text-muted-foreground">{detail}</p></CardContent></Card>;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const total = Math.max(0, Math.round(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (days) return `${days}d ${hours}h ${minutes}m`;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function formatAxisDuration(seconds: number): string {
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(0)}h`;
  if (seconds >= 60) return `${(seconds / 60).toFixed(0)}m`;
  return `${Math.round(seconds)}s`;
}

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 2 ? `${parts[0]} ${parts[parts.length - 1]}` : name;
}

function formatPendingDetail(items: { vendedor: string; pendientes: number }[]): string {
  if (!items.length) return "Sin pendientes";
  const visible = items.slice(0, 3).map((item) => `${shortName(item.vendedor)} (${item.pendientes})`);
  const remaining = items.length - visible.length;
  return `${visible.join(" · ")}${remaining > 0 ? ` · +${remaining}` : ""}`;
}
