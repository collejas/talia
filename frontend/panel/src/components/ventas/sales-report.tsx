"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Amount = number | string;

type SalesReportSummary = {
  numero_ventas: number;
  total_vendido: Amount;
  total_cobrado_periodo: Amount;
  saldo_pendiente: Amount;
  numero_pagos_parciales: number;
  numero_pendientes_pago: number;
  numero_pagadas: number;
};

type SalesReportPoint = { mes: string; total_vendido: Amount; total_cobrado: Amount };
type SalesReportItem = {
  id: string;
  cliente_id: string;
  cliente_nombre: string;
  oportunidad_id: string;
  codigo_oportunidad: string | null;
  oportunidad_titulo: string | null;
  vendedor_usuario_id: string | null;
  vendedor_nombre: string;
  fecha_venta: string;
  total: Amount;
  total_cobrado: Amount;
  saldo_pendiente: Amount;
  estatus: string;
  moneda: string;
};

type Seller = { id: string; nombre_completo: string | null; correo: string | null };
type SalesReportData = {
  resumen: SalesReportSummary;
  serie: SalesReportPoint[];
  items: SalesReportItem[];
  total: number;
  monedas: string[];
  vendedores: Seller[];
};

const PAGE_SIZE = 50;
const EMPTY_REPORT: SalesReportData = {
  resumen: {
    numero_ventas: 0,
    total_vendido: 0,
    total_cobrado_periodo: 0,
    saldo_pendiente: 0,
    numero_pagos_parciales: 0,
    numero_pendientes_pago: 0,
    numero_pagadas: 0,
  },
  serie: [],
  items: [],
  total: 0,
  monedas: [],
  vendedores: [],
};

type DatePreset = "mes" | "90d" | "ano" | "personalizado";
type Filters = { desde: string; hasta: string; estatus: string; vendedor: string; moneda: string };

function dateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultFilters(): Filters {
  const now = new Date();
  return {
    desde: dateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)),
    hasta: dateInputValue(now),
    estatus: "todos",
    vendedor: "todos",
    moneda: "MXN",
  };
}

function asNumber(value: Amount | null | undefined): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function formatMoney(value: Amount, currency: string): string {
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: currency.trim() || "MXN",
      maximumFractionDigits: 2,
    }).format(asNumber(value));
  } catch {
    return `${currency.trim()} ${asNumber(value).toLocaleString("es-MX")}`;
  }
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(date);
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    pendiente_pago: "Pendiente de pago",
    pago_parcial: "Pago parcial",
    pagada: "Pagada",
    cancelada: "Cancelada",
    reembolsada: "Reembolsada",
  };
  return labels[status] ?? status;
}

function periodLabel(value: string): string {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("es-MX", { month: "short", year: "2-digit" }).format(new Date(year, (month || 1) - 1, 1));
}

export function SalesReport() {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [preset, setPreset] = useState<DatePreset>("mes");
  const [offset, setOffset] = useState(0);
  const [report, setReport] = useState<SalesReportData>(EMPTY_REPORT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const updateFilter = useCallback((key: keyof Filters, value: string) => {
    setLoading(true);
    setError(null);
    setFilters((current) => ({ ...current, [key]: value }));
    setOffset(0);
  }, []);

  const selectPreset = useCallback((value: DatePreset) => {
    setPreset(value);
    if (value === "personalizado") return;
    setLoading(true);
    setError(null);
    const now = new Date();
    const from = value === "mes"
      ? new Date(now.getFullYear(), now.getMonth(), 1)
      : value === "ano"
        ? new Date(now.getFullYear(), 0, 1)
        : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89);
    setFilters((current) => ({ ...current, desde: dateInputValue(from), hasta: dateInputValue(now) }));
    setOffset(0);
  }, []);

  const changePage = useCallback((nextOffset: number) => {
    setLoading(true);
    setError(null);
    setOffset(nextOffset);
  }, []);

  useEffect(() => {
    if (!filters.desde || !filters.hasta) return;
    const params = new URLSearchParams({
      desde: filters.desde,
      hasta: filters.hasta,
      limit: String(PAGE_SIZE),
      offset: String(offset),
      moneda: filters.moneda,
    });
    if (filters.estatus !== "todos") params.set("estatus", filters.estatus);
    if (filters.vendedor !== "todos") params.set("vendedor_usuario_id", filters.vendedor);

    const controller = new AbortController();
    let waitingForCurrencyFetch = false;
    fetch(`/api/crm/ventas/reporte?${params.toString()}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "No se pudo cargar el reporte de ventas.");
        return body as SalesReportData;
      })
      .then((data) => {
        setReport({ ...EMPTY_REPORT, ...data });
        if (!data.monedas?.includes(filters.moneda) && data.monedas?.[0]) {
          waitingForCurrencyFetch = true;
          setLoading(true);
          setFilters((current) => ({ ...current, moneda: data.monedas[0].trim() }));
        }
      })
      .catch((failure: unknown) => {
        if (failure instanceof Error && failure.name === "AbortError") return;
        setError(failure instanceof Error ? failure.message : "No se pudo cargar el reporte de ventas.");
      })
      .finally(() => {
        if (!controller.signal.aborted && !waitingForCurrencyFetch) setLoading(false);
      });

    return () => controller.abort();
  }, [filters, offset]);

  const chartData = useMemo(
    () => report.serie.map((point) => ({
      ...point,
      label: periodLabel(point.mes),
      vendido: asNumber(point.total_vendido),
      cobrado: asNumber(point.total_cobrado),
    })),
    [report.serie],
  );

  const pageCount = Math.max(1, Math.ceil(report.total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="space-y-5">
      <section aria-label="Filtros del reporte" className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
        <div className="grid min-w-36 gap-1.5">
          <label htmlFor="sales-period" className="text-sm font-medium">Periodo de ventas</label>
          <select id="sales-period" value={preset} onChange={(event) => selectPreset(event.target.value as DatePreset)} className="h-9 rounded-md border bg-background px-3 text-sm">
            <option value="mes">Mes actual</option>
            <option value="90d">Últimos 90 días</option>
            <option value="ano">Año actual</option>
            <option value="personalizado">Personalizado</option>
          </select>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="sales-from" className="text-sm font-medium">Desde</label>
          <Input id="sales-from" type="date" value={filters.desde} onChange={(event) => { setPreset("personalizado"); updateFilter("desde", event.target.value); }} />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="sales-to" className="text-sm font-medium">Hasta</label>
          <Input id="sales-to" type="date" value={filters.hasta} onChange={(event) => { setPreset("personalizado"); updateFilter("hasta", event.target.value); }} />
        </div>
        <div className="grid min-w-44 gap-1.5">
          <label htmlFor="sales-vendor" className="text-sm font-medium">Vendedor</label>
          <select id="sales-vendor" value={filters.vendedor} onChange={(event) => updateFilter("vendedor", event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm">
            <option value="todos">Todos los vendedores visibles</option>
            {report.vendedores.map((seller) => <option key={seller.id} value={seller.id}>{seller.nombre_completo || seller.correo || "Vendedor"}</option>)}
          </select>
        </div>
        <div className="grid min-w-40 gap-1.5">
          <label htmlFor="sales-status" className="text-sm font-medium">Estado de venta</label>
          <select id="sales-status" value={filters.estatus} onChange={(event) => updateFilter("estatus", event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm">
            <option value="todos">Todos los estados</option>
            <option value="pendiente_pago">Pendiente de pago</option>
            <option value="pago_parcial">Pago parcial</option>
            <option value="pagada">Pagada</option>
            <option value="cancelada">Cancelada</option>
            <option value="reembolsada">Reembolsada</option>
          </select>
        </div>
        <div className="grid min-w-24 gap-1.5">
          <label htmlFor="sales-currency" className="text-sm font-medium">Moneda</label>
          <select id="sales-currency" value={filters.moneda} onChange={(event) => updateFilter("moneda", event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm">
            {(report.monedas.length ? report.monedas : [filters.moneda]).map((currency) => <option key={currency} value={currency.trim()}>{currency.trim()}</option>)}
          </select>
        </div>
      </section>

      {error ? <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}

      <section aria-label="Resumen de ventas" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Ventas formalizadas" value={report.resumen.numero_ventas.toLocaleString("es-MX")} detail={`${report.resumen.numero_pagos_parciales} con pago parcial`} />
        <MetricCard title="Total vendido" value={formatMoney(report.resumen.total_vendido, filters.moneda)} detail="Ventas del periodo seleccionado" />
        <MetricCard title="Cobrado en el periodo" value={formatMoney(report.resumen.total_cobrado_periodo, filters.moneda)} detail="Pagos confirmados en las fechas seleccionadas" />
        <MetricCard title="Saldo pendiente" value={formatMoney(report.resumen.saldo_pendiente, filters.moneda)} detail={`${report.resumen.numero_pendientes_pago} pendientes · ${report.resumen.numero_pagadas} liquidadas`} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Ventas y cobranza por mes</CardTitle>
          <CardDescription>Las ventas se agrupan por fecha de venta; los cobros, por fecha de confirmación del pago.</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {chartData.length ? <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} />
              <YAxis tickFormatter={(value: number) => new Intl.NumberFormat("es-MX", { notation: "compact", maximumFractionDigits: 1 }).format(value)} tickLine={false} axisLine={false} />
              <Tooltip formatter={(value) => formatMoney(value as number, filters.moneda)} />
              <Legend />
              <Bar dataKey="vendido" name="Vendido" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="cobrado" name="Cobrado" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer> : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{loading ? "Cargando reporte…" : "No hay ventas en este periodo."}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div><CardTitle>Ventas</CardTitle><CardDescription>{report.total.toLocaleString("es-MX")} resultados para los filtros seleccionados.</CardDescription></div>
          {loading ? <span className="text-xs text-muted-foreground">Actualizando…</span> : null}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Fecha</TableHead><TableHead>Cliente</TableHead><TableHead>Oportunidad</TableHead><TableHead>Vendedor</TableHead>
                <TableHead>Estado</TableHead><TableHead className="text-right">Venta</TableHead><TableHead className="text-right">Cobrado</TableHead><TableHead className="text-right">Saldo</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {report.items.map((item) => <TableRow key={item.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(item.fecha_venta)}</TableCell>
                  <TableCell className="min-w-40"><Link className="font-medium text-primary hover:underline" href={`/clientes/${encodeURIComponent(item.cliente_id)}`}>{item.cliente_nombre}</Link></TableCell>
                  <TableCell className="min-w-48">{item.codigo_oportunidad ? `${item.codigo_oportunidad} · ` : ""}{item.oportunidad_titulo || "—"}</TableCell>
                  <TableCell>{item.vendedor_nombre || "Sin vendedor"}</TableCell>
                  <TableCell>{statusLabel(item.estatus)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(item.total, item.moneda)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(item.total_cobrado, item.moneda)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(item.saldo_pendiente, item.moneda)}</TableCell>
                </TableRow>)}
                {!loading && report.items.length === 0 ? <TableRow><TableCell colSpan={8} className="h-24 text-center text-muted-foreground">No hay ventas que coincidan con los filtros.</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Página {currentPage} de {pageCount}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={loading || offset === 0} onClick={() => changePage(Math.max(0, offset - PAGE_SIZE))}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={loading || offset + PAGE_SIZE >= report.total} onClick={() => changePage(offset + PAGE_SIZE)}>Siguiente</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return <Card><CardHeader className="pb-2"><CardDescription>{title}</CardDescription><CardTitle className="text-xl tabular-nums">{value}</CardTitle></CardHeader><CardContent><p className="text-xs text-muted-foreground">{detail}</p></CardContent></Card>;
}
