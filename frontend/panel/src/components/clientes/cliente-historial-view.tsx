"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ClienteRecord } from "@/types/clientes";

type ClienteHistory = {
  cliente: ClienteRecord;
  oportunidades: Array<Record<string, unknown>>;
  cotizaciones: Array<Record<string, unknown>>;
  ventas: Array<Record<string, unknown>>;
  venta_items: Array<Record<string, unknown>>;
  pagos: Array<Record<string, unknown>>;
};

function text(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return value == null || value === "" ? "—" : String(value);
}

function money(row: Record<string, unknown>, key: string, currency = "MXN"): string {
  const value = Number(row[key]);
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(value);
}

function Empty({ label }: { label: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">No hay {label} registrados.</p>;
}

export function ClienteHistorialView({ history }: { history: ClienteHistory }) {
  const { cliente } = history;
  const title = cliente.razon_social || cliente.contacto?.nombre_completo || "Cliente";
  const sold = history.ventas.reduce((sum, row) => sum + (Number(row.total) || 0), 0);
  const paid = history.pagos
    .filter((row) => row.estatus === "confirmado")
    .reduce((sum, row) => sum + (Number(row.monto) || 0), 0);
  const currency = cliente.moneda || "MXN";

  return (
    <div className="space-y-6 px-6">
      <div>
        <p className="text-sm text-muted-foreground">Cliente</p>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {cliente.contacto?.correo || "Sin correo"} · {cliente.vendedor_nombre || "Sin vendedor"}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Oportunidades ganadas" value={history.oportunidades.length.toString()} />
        <SummaryCard label="Ventas" value={history.ventas.length.toString()} />
        <SummaryCard label="Total vendido" value={formatMoney(sold, currency)} />
        <SummaryCard label="Total cobrado" value={formatMoney(paid, currency)} />
      </div>

      <Tabs defaultValue="resumen" className="space-y-4">
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="oportunidades">Oportunidades</TabsTrigger>
          <TabsTrigger value="cotizaciones">Cotizaciones</TabsTrigger>
          <TabsTrigger value="ventas">Ventas</TabsTrigger>
          <TabsTrigger value="pagos">Pagos</TabsTrigger>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen">
          <Card><CardHeader><CardTitle>Información del cliente</CardTitle></CardHeader><CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <Info label="Empresa" value={cliente.razon_social || cliente.contacto?.company_name || "—"} />
            <Info label="Estado" value={cliente.estado_onboarding} />
            <Info label="Primera compra" value={cliente.ganado_en ? new Date(cliente.ganado_en).toLocaleDateString("es-MX") : "—"} />
            <Info label="Saldo pendiente" value={formatMoney(Math.max(sold - paid, 0), currency)} />
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="oportunidades"><HistoryTable rows={history.oportunidades} columns={[["titulo", "Oportunidad"], ["estado", "Estado"], ["monto_estimado", "Monto"]]} currency={currency} /></TabsContent>
        <TabsContent value="cotizaciones"><HistoryTable rows={history.cotizaciones} columns={[["id", "Cotización"], ["estatus", "Estado"], ["total", "Total"]]} currency={currency} /></TabsContent>
        <TabsContent value="ventas"><HistoryTable rows={history.ventas} columns={[["id", "Venta"], ["estatus", "Estado"], ["total", "Total"], ["fecha_venta", "Fecha"]]} currency={currency} /></TabsContent>
        <TabsContent value="pagos"><HistoryTable rows={history.pagos} columns={[["fecha_pago", "Fecha"], ["monto", "Monto"], ["metodo_pago", "Método"], ["estatus", "Estado"]]} currency={currency} /></TabsContent>
        <TabsContent value="documentos"><HistoryTable rows={cliente.documentos as unknown as Array<Record<string, unknown>>} columns={[["tipo", "Tipo"], ["estado", "Estado"], ["creado_en", "Fecha"]]} currency={currency} /></TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p></CardContent></Card>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-muted-foreground">{label}</p><p className="font-medium">{value}</p></div>;
}

function HistoryTable({ rows, columns, currency }: { rows: Array<Record<string, unknown>>; columns: Array<[string, string]>; currency: string }) {
  if (!rows.length) return <Card><CardContent><Empty label="registros" /></CardContent></Card>;
  return <Card><CardContent className="overflow-x-auto pt-6"><table className="w-full min-w-[520px] text-sm"><thead><tr className="border-b text-left text-muted-foreground">{columns.map(([, label]) => <th key={label} className="px-3 pb-3 font-medium">{label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={text(row, "id") !== "—" ? text(row, "id") : String(index)} className="border-b last:border-0">{columns.map(([key]) => <td key={key} className="px-3 py-3">{["total", "monto", "monto_estimado"].includes(key) ? money(row, key, currency) : text(row, key)}</td>)}</tr>)}</tbody></table></CardContent></Card>;
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(value);
}
